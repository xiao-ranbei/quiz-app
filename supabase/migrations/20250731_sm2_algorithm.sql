-- ============================================================
-- SM-2 间隔重复算法
-- 根据用户回答质量（0-5）更新卡片的调度状态
--
-- quality 含义：
--   0 - 完全不记得
--   1 - 答错了，但看到答案时觉得熟悉
--   2 - 答错了，但看到答案时觉得很简单
--   3 - 答对了，但很费力
--   4 - 答对了，有一些犹豫
--   5 - 答对了，毫不费力
--
-- 算法来源：SuperMemo-2 间隔重复算法
-- 与 src/lib/sm2.ts 中的 TypeScript 实现保持一致
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_sm2_state(
  p_ease float,
  p_interval_days int,
  p_repetitions int,
  p_quality int
) RETURNS TABLE (
  ease float,
  interval_days int,
  repetitions int,
  due timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  q int;
  v_ease float;
  v_interval int;
  v_repetitions int;
BEGIN
  -- 将 quality 限制在 0-5 范围
  q := GREATEST(0, LEAST(5, p_quality));

  v_ease := p_ease;
  v_interval := p_interval_days;
  v_repetitions := p_repetitions;

  -- 根据答题质量更新间隔和重复次数
  IF q < 3 THEN
    -- 答错：重置 repetitions，interval 设为 0（今天重做）
    v_repetitions := 0;
    v_interval := 0;
  ELSE
    -- 答对：根据 repetitions 计算 interval
    IF v_repetitions = 0 THEN
      v_interval := 1;
    ELSIF v_repetitions = 1 THEN
      v_interval := 6;
    ELSE
      v_interval := ROUND((v_interval * v_ease)::numeric)::int;
    END IF;
    v_repetitions := v_repetitions + 1;
  END IF;

  -- 更新 ease 因子：max(1.3, ease + 0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  v_ease := GREATEST(1.3, v_ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

  -- 设置返回列的值
  ease := v_ease;
  interval_days := v_interval;
  repetitions := v_repetitions;
  due := now() + (v_interval || ' days')::interval;

  RETURN NEXT;
END;
$$;