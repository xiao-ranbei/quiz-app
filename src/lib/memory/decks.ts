import { supabase } from '../supabase';
import type { Deck, DeckFilter, DeckInput } from '../../types';
import { getCurrentUserId } from './user';

// ============================================================
// 牌组 CRUD
// ============================================================

/**
 * 获取牌组列表
 * - 提供 filter.creator_id 时：返回公开牌组 + 该用户自己的私有牌组
 * - 否则只返回公开牌组
 * - 支持按 visibility / lang / card_type 过滤
 * - 按 created_at 倒序排列
 */
export async function getDecks(filter?: DeckFilter): Promise<Deck[]> {
  let query = supabase.from('decks').select('*');

  if (filter?.creator_id) {
    // 公开 OR 本人创建
    query = query.or(`visibility.eq.public,creator_id.eq.${filter.creator_id}`);
  } else {
    query = query.eq('visibility', 'public');
  }

  if (filter?.visibility) query = query.eq('visibility', filter.visibility);
  if (filter?.lang) query = query.eq('lang', filter.lang);
  if (filter?.card_type) query = query.eq('card_type', filter.card_type);

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Deck[];
}

/**
 * 获取单个牌组详情
 * @param id 牌组 ID
 * @returns 牌组对象；不存在时返回 null
 */
export async function getDeck(id: string): Promise<Deck | null> {
  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Deck | null;
}

/**
 * 创建牌组
 * creator_id 从当前登录用户获取；未登录抛错
 */
export async function createDeck(input: DeckInput): Promise<Deck> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('未登录，无法创建牌组');

  const { data, error } = await supabase
    .from('decks')
    .insert({
      name: input.name,
      description: input.description ?? null,
      lang: input.lang,
      card_type: input.card_type,
      visibility: input.visibility ?? 'private',
      creator_id: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Deck;
}

/**
 * 更新牌组字段（updated_at 由数据库触发器或代码层维护）
 */
export async function updateDeck(
  id: string,
  input: Partial<DeckInput>,
): Promise<Deck> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.lang !== undefined) updates.lang = input.lang;
  if (input.card_type !== undefined) updates.card_type = input.card_type;
  if (input.visibility !== undefined) updates.visibility = input.visibility;

  const { data, error } = await supabase
    .from('decks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Deck;
}

/**
 * 删除牌组（卡片会通过 on delete cascade 级联删除）
 */
export async function deleteDeck(id: string): Promise<void> {
  const { error } = await supabase.from('decks').delete().eq('id', id);
  if (error) throw error;
}
