-- ============================================================
-- 背诵模块个人中心聚合 RPC：一次调用返回
--   stats + myDecks + reviewHistory + recentReviews
-- 同时升级 get_memory_home_data 的 stats 增加 learning 和 studyDays 字段
-- ============================================================

-- 先升级 get_memory_home_data：stats 增加 learning/studyDays
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
    visible_decks AS (
      SELECT d.*
      FROM public.decks d
      WHERE d.visibility = 'public' OR d.creator_id = v_user_id
    ),
    deck_total AS (
      SELECT deck_id, count(*)::int AS total
      FROM public.cards
      WHERE deck_id IN (SELECT id FROM visible_decks)
      GROUP BY deck_id
    ),
    deck_learned AS (
      SELECT c.deck_id, count(*)::int AS learned
      FROM public.cards c
      INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
      WHERE c.deck_id IN (SELECT id FROM visible_decks)
      GROUP BY c.deck_id
    ),
    deck_mastered AS (
      SELECT c.deck_id, count(*)::int AS mastered
      FROM public.cards c
      INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
      WHERE c.deck_id IN (SELECT id FROM visible_decks)
        AND s.repetitions >= 3 AND s.interval_days >= 21
      GROUP BY c.deck_id
    ),
    deck_due AS (
      SELECT c.deck_id, count(*)::int AS due_today
      FROM public.cards c
      INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
      WHERE c.deck_id IN (SELECT id FROM visible_decks)
        AND s.due <= now()
      GROUP BY c.deck_id
    ),
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
    stats AS (
      SELECT
        COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id AND due <= now()), 0)::int AS due_today,
        20::int AS new_today,
        COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id AND repetitions >= 3 AND interval_days >= 21), 0)::int AS mastered,
        COALESCE((SELECT count(*) FROM public.cards c INNER JOIN visible_decks d ON d.id = c.deck_id), 0)::int AS total_cards,
        -- learning = 总 state 数 - mastered
        COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id), 0)::int
          - COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id AND repetitions >= 3 AND interval_days >= 21), 0)::int AS learning,
        -- studyDays = 去重 date(reviewed_at)
        COALESCE((
          SELECT count(*)::int FROM (
            SELECT DISTINCT date(r.reviewed_at)
            FROM public.card_reviews r
            WHERE r.user_id = v_user_id
          ) t
        ), 0)::int AS study_days
    )
    SELECT json_build_object(
      'stats', (
        SELECT json_build_object(
          'dueToday', due_today,
          'newToday', new_today,
          'mastered', mastered,
          'totalCards', total_cards,
          'learning', learning,
          'studyDays', study_days
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

-- ============================================================
-- 背诵模块 Profile 页聚合 RPC
-- params:
--   p_history_days int  - 复习趋势的天数
--   p_recent_limit  int - 最近复习记录条数
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_memory_profile_data(
  p_history_days int DEFAULT 7,
  p_recent_limit int DEFAULT 20
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_start_date date;
BEGIN
  v_user_id := auth.uid();
  v_start_date := current_date - (p_history_days - 1);

  RETURN (
    WITH
    -- 可见牌组
    visible_decks AS (
      SELECT d.*
      FROM public.decks d
      WHERE d.visibility = 'public' OR d.creator_id = v_user_id
    ),
    -- 牌组统计
    deck_total AS (
      SELECT deck_id, count(*)::int AS total
      FROM public.cards
      WHERE deck_id IN (SELECT id FROM visible_decks)
      GROUP BY deck_id
    ),
    deck_learned AS (
      SELECT c.deck_id, count(*)::int AS learned
      FROM public.cards c
      INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
      WHERE c.deck_id IN (SELECT id FROM visible_decks)
      GROUP BY c.deck_id
    ),
    deck_mastered AS (
      SELECT c.deck_id, count(*)::int AS mastered
      FROM public.cards c
      INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
      WHERE c.deck_id IN (SELECT id FROM visible_decks)
        AND s.repetitions >= 3 AND s.interval_days >= 21
      GROUP BY c.deck_id
    ),
    deck_due AS (
      SELECT c.deck_id, count(*)::int AS due_today
      FROM public.cards c
      INNER JOIN public.card_user_states s ON s.card_id = c.id AND s.user_id = v_user_id
      WHERE c.deck_id IN (SELECT id FROM visible_decks)
        AND s.due <= now()
      GROUP BY c.deck_id
    ),
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
    -- 全局统计
    stats AS (
      SELECT
        COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id AND due <= now()), 0)::int AS due_today,
        20::int AS new_today,
        COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id AND repetitions >= 3 AND interval_days >= 21), 0)::int AS mastered,
        COALESCE((SELECT count(*) FROM public.cards c INNER JOIN visible_decks d ON d.id = c.deck_id), 0)::int AS total_cards,
        COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id), 0)::int
          - COALESCE((SELECT count(*) FROM public.card_user_states WHERE user_id = v_user_id AND repetitions >= 3 AND interval_days >= 21), 0)::int AS learning,
        COALESCE((
          SELECT count(*)::int FROM (
            SELECT DISTINCT date(r.reviewed_at)
            FROM public.card_reviews r
            WHERE r.user_id = v_user_id
          ) t
        ), 0)::int AS study_days
    ),
    -- 复习历史（按天聚合，缺失日期补 0）
    date_range AS (
      SELECT generate_series(v_start_date, current_date, interval '1 day')::date AS d
    ),
    review_counts AS (
      SELECT date(reviewed_at) AS rd, count(*)::int AS cnt
      FROM public.card_reviews
      WHERE user_id = v_user_id AND reviewed_at >= v_start_date::timestamp
      GROUP BY date(reviewed_at)
    ),
    review_history AS (
      SELECT json_agg(
        json_build_object(
          'date', to_char(dr.d, 'YYYY-MM-DD'),
          'count', COALESCE(rc.cnt, 0)
        )
        ORDER BY dr.d
      ) AS items
      FROM date_range dr
      LEFT JOIN review_counts rc ON rc.rd = dr.d
    ),
    -- 最近复习记录（JOIN cards 取 front/back）
    recent_reviews AS (
      SELECT COALESCE((
        SELECT json_agg(j)
        FROM (
          SELECT
            r.id,
            r.card_id,
            c.front,
            c.back,
            r.mode,
            r.quality,
            r.reviewed_at
          FROM public.card_reviews r
          LEFT JOIN public.cards c ON c.id = r.card_id
          WHERE r.user_id = v_user_id
          ORDER BY r.reviewed_at DESC
          LIMIT p_recent_limit
        ) j
      ), '[]'::json) AS items
    )
    SELECT json_build_object(
      'stats', (
        SELECT json_build_object(
          'dueToday', due_today,
          'newToday', new_today,
          'mastered', mastered,
          'totalCards', total_cards,
          'learning', learning,
          'studyDays', study_days
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
      'review_history', COALESCE((SELECT items FROM review_history), '[]'::json),
      'recent_reviews', COALESCE((SELECT items FROM recent_reviews), '[]'::json)
    )
  );
END;
$$;
