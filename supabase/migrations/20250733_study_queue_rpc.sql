-- ============================================================
-- 今日学习队列 RPC
-- 一次调用返回指定牌组的今日学习卡片列表
--
-- 返回 JSON 数组格式：
-- [{
--   "id": uuid,
--   "front": text,
--   "back": text,
--   "deck_id": uuid,
--   "metadata": jsonb,
--   "tags": text[]
-- }]
-- ============================================================

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
