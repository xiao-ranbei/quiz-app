-- ============================================================
-- 修复背诵模块 RPC 越权：SECURITY DEFINER 函数未校验牌组可见性
--
-- 问题：get_study_queue / get_deck_detail / submit_review 为
-- SECURITY DEFINER，绕过 RLS 后任何登录用户传入私有 deck_id /
-- card_id 均可读取或写入私有牌组数据。
--
-- 修复：三个函数统一校验
--   visibility = 'public' OR creator_id = auth.uid() OR public.is_admin()
-- ============================================================

-- ------------------------------------------------------------
-- 1. get_study_queue：不可见的牌组返回空数组
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_study_queue(
  p_deck_id uuid,
  p_new_card_limit int DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_due_ids uuid[];
  v_new_ids uuid[];
  v_all_ids uuid[];
  v_result json;
BEGIN
  -- 1. 获取当前用户 ID，未登录返回空数组
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  -- 1.5 校验牌组可见性：公开 或 本人创建 或 管理员
  IF NOT EXISTS (
    SELECT 1 FROM public.decks d
    WHERE d.id = p_deck_id
      AND (d.visibility = 'public' OR d.creator_id = v_user_id OR public.is_admin())
  ) THEN
    RETURN '[]'::json;
  END IF;

  -- 2. 获取该牌组所有卡片 ID 列表
  -- 3. 获取用户到期卡（due <= now()），按 due 升序排列
  SELECT ARRAY(
    SELECT cus.card_id
    FROM card_user_states cus
    JOIN cards c ON c.id = cus.card_id
    WHERE c.deck_id = p_deck_id
      AND cus.user_id = v_user_id
      AND cus.due <= now()
    ORDER BY cus.due ASC
  ) INTO v_due_ids;

  -- 4. 获取用户已学过的卡片集合（有 card_user_states 记录的 card_id）
  -- 5 & 6. 计算需要补充的新卡数量，从未学过的卡片中取前 N 张
  SELECT ARRAY(
    SELECT c.id
    FROM cards c
    WHERE c.deck_id = p_deck_id
      AND c.id NOT IN (
        SELECT card_id
        FROM card_user_states
        WHERE user_id = v_user_id
      )
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT GREATEST(0, p_new_card_limit - COALESCE(array_length(v_due_ids, 1), 0))
  ) INTO v_new_ids;

  -- 7. 合并到期卡 + 新卡的 ID 列表
  v_all_ids := COALESCE(v_due_ids, ARRAY[]::uuid[]) || COALESCE(v_new_ids, ARRAY[]::uuid[]);

  -- 如果没有任何卡片，返回空数组
  IF array_length(v_all_ids, 1) IS NULL THEN
    RETURN '[]'::json;
  END IF;

  -- 8. 查询这些 ID 的完整卡片数据并返回 JSON 数组
  SELECT json_agg(
    json_build_object(
      'id', c.id,
      'front', c.front,
      'back', c.back,
      'deck_id', c.deck_id,
      'metadata', c.metadata,
      'tags', c.tags
    )
    ORDER BY
      -- 到期卡按 due 排序，新卡按创建时间排序
      CASE WHEN c.id = ANY(v_due_ids) THEN
        (SELECT cus.due FROM card_user_states cus WHERE cus.user_id = v_user_id AND cus.card_id = c.id)
      ELSE c.created_at
      END ASC
  )
  FROM cards c
  WHERE c.id = ANY(v_all_ids)
  INTO v_result;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- ------------------------------------------------------------
-- 2. submit_review：卡片不存在或其牌组不可见时抛错
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_review(
  p_card_id uuid,
  p_mode text,
  p_quality int,
  p_user_answer text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_ease float;
  v_interval_days int;
  v_repetitions int;
  v_new_ease float;
  v_new_interval int;
  v_new_repetitions int;
  v_new_due timestamptz;
  v_state_id uuid;
  v_review_id uuid;
BEGIN
  -- 1. 获取当前用户 ID，未登录则抛出异常
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '用户未登录，无法提交复习';
  END IF;

  -- 1.5 校验卡片存在且其牌组可见（公开 或 本人创建 或 管理员）
  IF NOT EXISTS (
    SELECT 1 FROM public.cards c
    JOIN public.decks d ON d.id = c.deck_id
    WHERE c.id = p_card_id
      AND (d.visibility = 'public' OR d.creator_id = v_user_id OR public.is_admin())
  ) THEN
    RAISE EXCEPTION '卡片不存在或无权访问';
  END IF;

  -- 2. 查询现有调度状态；若不存在则使用默认值
  SELECT ease, interval_days, repetitions
    INTO v_ease, v_interval_days, v_repetitions
  FROM card_user_states
  WHERE user_id = v_user_id
    AND card_id = p_card_id;

  IF NOT FOUND THEN
    -- 首次复习，使用默认值
    v_ease := 2.5;
    v_interval_days := 0;
    v_repetitions := 0;
  END IF;

  -- 3. 调用 SM-2 算法计算新的调度状态
  SELECT ease, interval_days, repetitions, due
    INTO v_new_ease, v_new_interval, v_new_repetitions, v_new_due
  FROM calculate_sm2_state(v_ease, v_interval_days, v_repetitions, p_quality);

  -- 4. UPSERT 调度状态（冲突键：user_id + card_id）
  INSERT INTO card_user_states (user_id, card_id, ease, interval_days, repetitions, due, last_reviewed)
  VALUES (v_user_id, p_card_id, v_new_ease, v_new_interval, v_new_repetitions, v_new_due, now())
  ON CONFLICT (user_id, card_id)
  DO UPDATE SET
    ease = EXCLUDED.ease,
    interval_days = EXCLUDED.interval_days,
    repetitions = EXCLUDED.repetitions,
    due = EXCLUDED.due,
    last_reviewed = EXCLUDED.last_reviewed
  RETURNING id INTO v_state_id;

  -- 5. 插入复习日志
  INSERT INTO card_reviews (user_id, card_id, mode, quality, user_answer)
  VALUES (v_user_id, p_card_id, p_mode, p_quality, p_user_answer)
  RETURNING id INTO v_review_id;

  -- 6. 返回包含 state 和 review 的 JSON
  RETURN json_build_object(
    'state', json_build_object(
      'id', v_state_id,
      'user_id', v_user_id,
      'card_id', p_card_id,
      'ease', v_new_ease,
      'interval_days', v_new_interval,
      'repetitions', v_new_repetitions,
      'due', v_new_due,
      'last_reviewed', now()
    ),
    'review', json_build_object(
      'id', v_review_id,
      'user_id', v_user_id,
      'card_id', p_card_id,
      'mode', p_mode,
      'quality', p_quality,
      'user_answer', p_user_answer,
      'reviewed_at', now()
    )
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. get_deck_detail：不可见的牌组返回 NULL（前端显示不存在）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_deck_detail(
  p_deck_id uuid,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 20,
  p_search text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deck json;
  v_total int;
  v_learned int;
  v_mastered int;
  v_due_today int;
  v_new_cards int;
  v_review_history json;
  v_cards_data json;
  v_cards_total int;
  v_offset int;
BEGIN
  -- 牌组基础信息（含可见性校验：公开 或 本人创建 或 管理员）
  SELECT json_build_object(
    'id', d.id,
    'name', d.name,
    'description', d.description,
    'lang', d.lang,
    'card_type', d.card_type,
    'visibility', d.visibility,
    'creator_id', d.creator_id,
    'created_at', d.created_at
  )
  INTO v_deck
  FROM public.decks d
  WHERE d.id = p_deck_id
    AND (d.visibility = 'public' OR d.creator_id = v_user_id OR public.is_admin());

  -- 牌组不存在或无权访问则返回 null
  IF v_deck IS NULL THEN
    RETURN NULL;
  END IF;

  -- 统计：卡片总数
  SELECT count(*)::int INTO v_total
  FROM public.cards
  WHERE deck_id = p_deck_id;

  -- 未登录用户：学习相关统计全部为 0
  IF v_user_id IS NULL THEN
    v_learned := 0;
    v_mastered := 0;
    v_due_today := 0;
  ELSE
    -- 已学习卡片数（存在 card_user_states 记录）
    SELECT count(*)::int INTO v_learned
    FROM public.cards c
    INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
    WHERE c.deck_id = p_deck_id;

    -- 已掌握卡片数（repetitions >= 3 且 interval_days >= 21）
    SELECT count(*)::int INTO v_mastered
    FROM public.cards c
    INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
    WHERE c.deck_id = p_deck_id
      AND s.repetitions >= 3 AND s.interval_days >= 21;

    -- 今日到期卡片数（due <= now）
    SELECT count(*)::int INTO v_due_today
    FROM public.cards c
    INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
    WHERE c.deck_id = p_deck_id
      AND s.due <= now();
  END IF;

  -- 新卡数 = 总数 - 已学习数
  v_new_cards := GREATEST(0, COALESCE(v_total, 0) - COALESCE(v_learned, 0));

  -- 最近 7 天复习历史（按天聚合，使用 generate_series 补全无复习的日期）
  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(json_agg(json_build_object('date', day, 'count', count) ORDER BY day), '[]'::json)
    INTO v_review_history
    FROM (
      SELECT
        to_char(gs.day, 'YYYY-MM-DD') AS day,
        count(cr.id)::int AS count
      FROM generate_series(
        (current_date - interval '6 days')::date,
        current_date::date,
        '1 day'
      ) AS gs(day)
      LEFT JOIN public.card_reviews cr
        ON cr.user_id = v_user_id
        AND cr.card_id IN (SELECT id FROM public.cards WHERE deck_id = p_deck_id)
        AND cr.reviewed_at::date = gs.day
      GROUP BY gs.day
    ) hist;
  ELSE
    v_review_history := '[]'::json;
  END IF;

  -- 分页查询卡片列表（支持 front / back 模糊匹配）
  v_offset := (GREATEST(1, p_page) - 1) * p_page_size;

  -- 卡片总数（应用搜索过滤后）
  SELECT count(*)::int INTO v_cards_total
  FROM public.cards
  WHERE deck_id = p_deck_id
    AND (p_search IS NULL
         OR front ILIKE '%' || p_search || '%'
         OR back ILIKE '%' || p_search || '%');

  -- 当前页卡片数据
  SELECT COALESCE(json_agg(json_build_object(
    'id', c.id,
    'deck_id', c.deck_id,
    'front', c.front,
    'back', c.back,
    'metadata', c.metadata,
    'tags', c.tags,
    'creator_id', c.creator_id,
    'created_at', c.created_at
  ) ORDER BY c.created_at, c.id), '[]'::json)
  INTO v_cards_data
  FROM public.cards c
  WHERE c.deck_id = p_deck_id
    AND (p_search IS NULL
         OR c.front ILIKE '%' || p_search || '%'
         OR c.back ILIKE '%' || p_search || '%')
  LIMIT p_page_size OFFSET v_offset;

  RETURN json_build_object(
    'deck', v_deck,
    'stats', json_build_object(
      'total', v_total,
      'learned', v_learned,
      'mastered', v_mastered,
      'dueToday', v_due_today,
      'newCards', v_new_cards
    ),
    'reviewHistory', v_review_history,
    'cards', json_build_object(
      'data', v_cards_data,
      'total', v_cards_total
    )
  );
END;
$$;
