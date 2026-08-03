import { supabase } from '../supabase';
import type { Card, CardInput } from '../../types';
import { getCurrentUserId } from './user';

// ============================================================
// 卡片 CRUD
// ============================================================

/**
 * 插入卡片
 * creator_id 从当前登录用户获取；未登录抛错
 */
export async function insertCard(input: CardInput): Promise<Card> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('未登录，无法创建卡片');

  const { data, error } = await supabase
    .from('cards')
    .insert({
      deck_id: input.deck_id,
      front: input.front,
      back: input.back,
      metadata: input.metadata ?? {},
      tags: input.tags ?? [],
      creator_id: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Card;
}

/**
 * 批量插入卡片（所有 item 共享当前用户 creator_id）
 */
export async function insertCardsBulk(items: CardInput[]): Promise<Card[]> {
  if (items.length === 0) return [];

  const userId = await getCurrentUserId();
  if (!userId) throw new Error('未登录，无法创建卡片');

  const rows = items.map((item) => ({
    deck_id: item.deck_id,
    front: item.front,
    back: item.back,
    metadata: item.metadata ?? {},
    tags: item.tags ?? [],
    creator_id: userId,
  }));

  const { data, error } = await supabase.from('cards').insert(rows).select();
  if (error) throw error;
  return (data ?? []) as Card[];
}

/**
 * 更新卡片字段
 */
export async function updateCard(
  id: string,
  input: Partial<CardInput>,
): Promise<Card> {
  const updates: Record<string, unknown> = {};
  if (input.deck_id !== undefined) updates.deck_id = input.deck_id;
  if (input.front !== undefined) updates.front = input.front;
  if (input.back !== undefined) updates.back = input.back;
  if (input.metadata !== undefined) updates.metadata = input.metadata;
  if (input.tags !== undefined) updates.tags = input.tags;

  const { data, error } = await supabase
    .from('cards')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Card;
}

/**
 * 删除卡片
 */
export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) throw error;
}
