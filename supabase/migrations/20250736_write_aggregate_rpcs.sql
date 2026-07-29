-- ============================================================
-- 写操作聚合 RPC：一次调用完成多表写入
-- 包含 2 个函数：
--   4. submit_exam_session(...)    提交考试会话（写 exam_sessions + user_history + wrong_book）
--   5. save_practice_record(...)   保存练习记录（写 user_history + wrong_book）
--
-- 约定：
--   - 所有函数使用 SECURITY DEFINER
--   - 批量 upsert wrong_book 使用 INSERT ... ON CONFLICT 方式，不循环调用 upsert_wrong_book RPC
--   - 每个函数内的所有写操作在同一个事务内完成
-- ============================================================


-- ------------------------------------------------------------
-- 4. submit_exam_session(p_user_id, p_title, p_total, p_time_limit_sec, p_answers)
-- 提交考试会话，一次事务完成：
--   1. 生成 session_id = gen_random_uuid()
--   2. 计算得分 = 答对数量
--   3. INSERT INTO exam_sessions
--   4. 批量 INSERT INTO user_history（mode='exam', session_id）
--   5. 对答错的题目批量 upsert wrong_book
--   6. 返回 {sessionId, score}
--
-- p_answers 格式：[{question_id, user_answer, is_correct}, ...]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_exam_session(
  p_user_id uuid,
  p_title text,
  p_total int,
  p_time_limit_sec int,
  p_answers jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid := gen_random_uuid();
  v_score int;
BEGIN
  -- 计算得分：答对数量
  SELECT count(*)::int INTO v_score
  FROM jsonb_array_elements(p_answers) AS elem
  WHERE (elem->>'is_correct')::boolean = true;

  -- 1. 插入考试会话记录
  INSERT INTO public.exam_sessions (id, user_id, title, total_questions, time_limit_sec, started_at, submitted_at, score)
  VALUES (v_session_id, p_user_id, p_title, p_total, p_time_limit_sec, now(), now(), v_score);

  -- 2. 批量插入做题历史（mode='exam'，关联 session_id）
  INSERT INTO public.user_history (user_id, question_id, user_answer, is_correct, mode, session_id)
  SELECT
    p_user_id,
    (elem->>'question_id')::uuid,
    elem->>'user_answer',
    (elem->>'is_correct')::boolean,
    'exam',
    v_session_id
  FROM jsonb_array_elements(p_answers) AS elem;

  -- 3. 批量 upsert 错题本（仅答错的题目，使用 ON CONFLICT 方式，不循环调用 RPC）
  INSERT INTO public.wrong_book (user_id, question_id, wrong_count, last_wrong_at, mastered)
  SELECT
    p_user_id,
    (elem->>'question_id')::uuid,
    1,
    now(),
    false
  FROM jsonb_array_elements(p_answers) AS elem
  WHERE (elem->>'is_correct')::boolean = false
  ON CONFLICT (user_id, question_id) DO UPDATE
  SET
    wrong_count = public.wrong_book.wrong_count + 1,
    last_wrong_at = now(),
    mastered = false;

  -- 4. 返回会话 ID 与得分
  RETURN json_build_object(
    'sessionId', v_session_id,
    'score', v_score
  );
END;
$$;


-- ------------------------------------------------------------
-- 5. save_practice_record(p_user_id, p_question_id, p_user_answer, p_is_correct)
-- 保存练习记录，一次事务完成：
--   1. INSERT INTO user_history（mode='practice'）
--   2. 若答错：upsert wrong_book（复用现有 upsert_wrong_book 逻辑，使用 ON CONFLICT 方式）
--   3. 返回 {success: true}
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_practice_record(
  p_user_id uuid,
  p_question_id uuid,
  p_user_answer text,
  p_is_correct boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. 插入做题历史
  INSERT INTO public.user_history (user_id, question_id, user_answer, is_correct, mode)
  VALUES (p_user_id, p_question_id, p_user_answer, p_is_correct, 'practice');

  -- 2. 答错则加入错题本（使用 INSERT ... ON CONFLICT 方式，不调用 upsert_wrong_book RPC）
  IF NOT p_is_correct THEN
    INSERT INTO public.wrong_book (user_id, question_id, wrong_count, last_wrong_at, mastered)
    VALUES (p_user_id, p_question_id, 1, now(), false)
    ON CONFLICT (user_id, question_id) DO UPDATE
    SET
      wrong_count = public.wrong_book.wrong_count + 1,
      last_wrong_at = now(),
      mastered = false;
  END IF;

  -- 3. 返回成功标识
  RETURN json_build_object('success', true);
END;
$$;
