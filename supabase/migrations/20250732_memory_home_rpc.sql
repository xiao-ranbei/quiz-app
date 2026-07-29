-- ============================================================
-- 首页数据聚合 RPC：一次调用返回统计数据 + 我的牌组 + 公开牌组
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_memory_home_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  RETURN (
    WITH
    -- 可见牌组：公开牌组 + 当前用户创建的私有牌组
    visible_decks AS (
      SELECT d.*
      FROM public.decks d
      WHERE d.visibility = 'public' OR d.creator_id = v_user_id
    ),
    -- 每个牌组的卡片总数
    deck_total AS (
      SELECT deck_id, count(*)::int AS total
      FROM public.cards
      WHERE deck_id IN (SELECT id FROM visible_decks)
      GROUP BY deck_id
    ),
    -- 每个牌组中已学习的卡片数（有 user_state 记录）
    deck_learned AS (
      SELECT c.deck_id, count(*)::int AS learned
      FROM public.cards c
      INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
      WHERE c.deck_id IN (SELECT id FROM visible_decks)
      GROUP BY c.deck_id
    ),
    -- 每个牌组中已掌握的卡片数（repetitions >= 3 且 interval_days >= 21）
    deck_mastered AS (
      SELECT c.deck_id, count(*)::int AS mastered
      FROM public.cards c
      INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
      WHERE c.deck_id IN (SELECT id FROM visible_decks)
        AND s.repetitions >= 3 AND s.interval_days >= 21
      GROUP BY c.deck_id
    ),
    -- 每个牌组中今天到期的卡片数
    deck_due AS (
      SELECT c.deck_id, count(*)::int AS due_today
      FROM public.cards c
      INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
      WHERE c.deck_id IN (SELECT id FROM visible_decks)
        AND s.due <= now()
      GROUP BY c.deck_id
    ),
    -- 合并每个牌组的统计数据
    deck_stats AS (
      SELECT
        d.id,
        d.name,
        d.description,
        d.lang,
        d.card_type,
        d.visibility,
        d.creator_id,
        COALESCE(dt.total, 0) AS total,
        COALESCE(dl.learned, 0) AS learned,
        COALESCE(dm.mastered, 0) AS mastered,
        COALESCE(dd.due_today, 0) AS due_today,
        COALESCE(dt.total, 0) - COALESCE(dl.learned, 0) AS new_cards
      FROM visible_decks d
      LEFT JOIN deck_total dt ON dt.deck_id = d.id
      LEFT JOIN deck_learned dl ON dl.deck_id = d.id
      LEFT JOIN deck_mastered dm ON dm.deck_id = d.id
      LEFT JOIN deck_due dd ON dd.deck_id = d.id
    ),
    -- 全局统计数据
    stats AS (
      SELECT
        COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id AND due <= now()), 0)::int AS due_today,
        20::int AS new_today,
        COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id AND repetitions >= 3 AND interval_days >= 21), 0)::int AS mastered,
        COALESCE((SELECT count(*) FROM public.cards c INNER JOIN visible_decks d ON d.id = c.deck_id), 0)::int AS total_cards
    )
    SELECT json_build_object(
      'stats', (
        SELECT json_build_object(
          'dueToday', due_today,
          'newToday', new_today,
          'mastered', mastered,
          'totalCards', total_cards
        )
        FROM stats
      ),
      'my_decks', COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', id,
            'name', name,
            'description', description,
            'lang', lang,
            'card_type', card_type,
            'visibility', visibility,
            'total', total,
            'learned', learned,
            'mastered', mastered,
            'dueToday', due_today,
            'newCards', new_cards
          )
        )
        FROM deck_stats
        WHERE creator_id = v_user_id
      ), '[]'::json),
      'public_decks', COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', id,
            'name', name,
            'description', description,
            'lang', lang,
            'card_type', card_type,
            'visibility', visibility,
            'total', total,
            'learned', learned,
            'mastered', mastered,
            'dueToday', due_today,
            'newCards', new_cards
          )
        )
        FROM deck_stats
        WHERE visibility = 'public'
      ), '[]'::json)
    )
  );
END;
$$;