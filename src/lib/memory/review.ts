import { supabase } from '../supabase';
import type { Card, CardUserState, CardReview, ReviewMode } from '../../types';

// ============================================================
// 学习队列 + 提交复习（RPC）
// ============================================================

/**
 * 获取指定牌组的今日学习队列（一次 RPC 调用返回到期卡 + 新卡）
 *
 * 对应 SQL：`public.get_study_queue(p_deck_id, p_new_card_limit)`
 *
 * @param deckId 牌组 ID
 * @param newCardLimit 新卡配额（默认 20）
 * @returns 卡片数组（到期卡按 due 升序，新卡按创建时间升序）
 * @throws RPC 调用失败时抛出异常
 */
export async function fetchStudyQueue(
  deckId: string,
  newCardLimit = 20,
): Promise<Card[]> {
  const { data, error } = await supabase.rpc('get_study_queue', {
    p_deck_id: deckId,
    p_new_card_limit: newCardLimit,
  });
  if (error) throw error;

  const list = (data as unknown as Array<{
    id: string;
    front: string;
    back: string;
    deck_id: string;
    metadata?: unknown;
    tags?: string[];
  }>) ?? [];

  return list.map((c) => ({
    id: c.id,
    deck_id: c.deck_id,
    front: c.front,
    back: c.back,
    metadata: (c.metadata ?? {}) as Card['metadata'],
    tags: c.tags ?? [],
  }));
}

/**
 * 提交一次复习记录（一次 RPC 调用完成 SM-2 调度计算 + upsert state + 插入 review）
 *
 * 对应 SQL：`public.submit_review(p_card_id, p_mode, p_quality, p_user_answer)`
 *
 * @param cardId 卡片 ID
 * @param mode 复习模式
 * @param quality 回答质量 0-5
 * @param userAnswer 用户作答内容（可选）
 * @returns 更新后的调度状态和复习记录
 * @throws RPC 调用失败时抛出异常（如未登录）
 */
export async function submitReviewRpc(
  cardId: string,
  mode: ReviewMode,
  quality: number,
  userAnswer?: string,
): Promise<{ state: CardUserState; review: CardReview }> {
  const { data, error } = await supabase.rpc('submit_review', {
    p_card_id: cardId,
    p_mode: mode,
    p_quality: quality,
    p_user_answer: userAnswer ?? null,
  });
  if (error) throw error;

  const raw = data as unknown as {
    state: CardUserState;
    review: CardReview;
  };

  return {
    state: raw.state,
    review: raw.review,
  };
}
