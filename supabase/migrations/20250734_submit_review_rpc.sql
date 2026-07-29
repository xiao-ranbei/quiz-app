-- ============================================================
-- submit_review RPC 函数
-- 一次调用完成复习提交的所有操作：
--   1. 获取当前用户 ID，校验登录状态
--   2. 查询或初始化卡片的调度状态
--   3. 调用 SM-2 算法计算新的调度
--   4. UPSERT card_user_states
--   5. INSERT card_reviews 复习记录
--   6. 返回更新后的 state 和 review（JSON）
-- ============================================================

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