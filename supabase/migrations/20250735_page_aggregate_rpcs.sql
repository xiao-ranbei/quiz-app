-- ============================================================
-- 页面级读聚合 RPC：一次调用返回整页所需数据
-- 包含 3 个函数：
--   1. get_home_data()              首页聚合（题目总数 + 分类计数）
--   2. get_deck_detail(...)         牌组详情页聚合（牌组 + 统计 + 复习历史 + 分页卡片）
--   3. get_profile_data()           个人中心页聚合（统计 + 考试记录 + AI 配置）
--
-- 约定：
--   - 所有函数使用 SECURITY DEFINER，绕过 RLS 读取用户自身数据
--   - 使用 auth.uid() 获取当前用户
--   - JSON 字段名统一使用驼峰命名（camelCase）
-- ============================================================


-- ------------------------------------------------------------
-- 1. get_home_data()
-- 首页聚合：题目总数 + 各分类题目计数
-- 未登录用户也可调用（数据为全局统计）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_home_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_total_questions bigint;
  v_category_counts json;
BEGIN
  -- 题目总数
  SELECT count(*) INTO v_total_questions FROM public.questions;

  -- 分类题目计数（复用已有 get_category_question_counts RPC 逻辑）
  SELECT COALESCE(json_agg(json_build_object('category_id', category_id, 'count', count)), '[]'::json)
  INTO v_category_counts
  FROM (
    SELECT category_id, count(*)::bigint as count
    FROM public.questions
    WHERE category_id IS NOT NULL
    GROUP BY category_id
  ) sub;

  RETURN json_build_object(
    'totalQuestions', v_total_questions,
    'categoryCounts', v_category_counts
  );
END;
$$;


-- ------------------------------------------------------------
-- 2. get_deck_detail(p_deck_id, p_page, p_page_size, p_search)
-- 牌组详情页聚合：
--   - deck:         牌组基础信息
--   - stats:        统计（total / learned / mastered / dueToday / newCards）
--   - reviewHistory: 最近 7 天复习历史 [{date, count}]
--   - cards:        分页卡片列表 {data: [...], total: int}
-- 未登录用户：learned / mastered / dueToday 为 0，reviewHistory 为空数组
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
  -- 牌组基础信息
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
  WHERE d.id = p_deck_id;

  -- 牌组不存在则返回 null
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


-- ------------------------------------------------------------
-- 3. get_profile_data()
-- 个人中心页聚合：
--   - stats:        用户统计（totalAnswered / correct / wrongCount / examCount）
--   - examSessions: 最近 20 条考试记录
--   - aiConfig:     用户 AI 配置（可能为 null）
-- 未登录用户：stats 全为 0，examSessions 空数组，aiConfig 为 null
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_profile_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_stats json;
  v_exam_sessions json;
  v_ai_config json;
BEGIN
  -- 未登录用户：返回空数据
  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'stats', json_build_object(
        'totalAnswered', 0,
        'correct', 0,
        'wrongCount', 0,
        'examCount', 0
      ),
      'examSessions', '[]'::json,
      'aiConfig', NULL
    );
  END IF;

  -- 用户统计（复用 get_user_stats 逻辑）
  SELECT json_build_object(
    'totalAnswered', total_answered,
    'correct', correct,
    'wrongCount', wrong_count,
    'examCount', exam_count
  )
  INTO v_stats
  FROM public.get_user_stats(v_user_id);

  -- 最近 20 条考试记录（子查询限制条数后再聚合）
  SELECT COALESCE(json_agg(json_build_object(
    'id', es.id,
    'title', es.title,
    'totalQuestions', es.total_questions,
    'timeLimitSec', es.time_limit_sec,
    'score', es.score,
    'startedAt', es.started_at,
    'submittedAt', es.submitted_at
  ) ORDER BY es.started_at DESC), '[]'::json)
  INTO v_exam_sessions
  FROM (
    SELECT *
    FROM public.exam_sessions
    WHERE user_id = v_user_id
    ORDER BY started_at DESC
    LIMIT 20
  ) es;

  -- 用户 AI 配置（无配置则返回 null）
  SELECT json_build_object(
    'id', c.id,
    'userId', c.user_id,
    'apiBaseUrl', c.api_base_url,
    'apiKey', c.api_key,
    'model', c.model,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at
  )
  INTO v_ai_config
  FROM public.user_ai_configs c
  WHERE c.user_id = v_user_id;

  RETURN json_build_object(
    'stats', v_stats,
    'examSessions', v_exam_sessions,
    'aiConfig', v_ai_config
  );
END;
$$;
