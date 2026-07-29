import { supabase } from './supabase';
import { sm2 } from './sm2';
import type {
  Deck, Card, CardUserState, CardReview,
  MemoryStats, DeckStats, ReviewHistoryItem,
  DeckFilter, CardInput, DeckInput, ReviewMode, SM2State,
  DeckWithStats,
} from '../types';
import { useAuthStore } from '../store/authStore';

// 复用 questions.ts 中的管理员判定（邮箱白名单 + user_profiles.role_key 双重判定）
export { isCurrentUserAdmin } from './questions';

/**
 * 获取当前登录用户 ID
 * 优先从 authStore 读取，避免每次调用 auth.getUser() 网络往返
 */
async function getCurrentUserId(): Promise<string | null> {
  // 优先从 Zustand store 读取（同步，无网络请求）
  const storeUser = useAuthStore.getState().user;
  if (storeUser?.id) return storeUser.id;
  // 降级：store 未初始化时回退到 auth.getUser()
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

// ============================================================
// SubTask 4.2: Deck CRUD
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
export async function updateDeck(id: string, input: Partial<DeckInput>): Promise<Deck> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
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

// ============================================================
// SubTask 4.3: Card CRUD
// ============================================================

/**
 * 分页查询某牌组下的卡片
 * - search 模糊匹配 front 或 back（ilike）
 * - total 通过 count head 单独查询
 * @returns { data: Card[]; total: number }
 */
export async function getCards(
  deckId: string,
  pagination?: { page: number; pageSize: number; search?: string },
): Promise<{ data: Card[]; total: number }> {
  // 计数查询
  let countQuery = supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId);
  if (pagination?.search) {
    const kw = `%${pagination.search}%`;
    countQuery = countQuery.or(`front.ilike.${kw},back.ilike.${kw}`);
  }
  const { count, error: countErr } = await countQuery;
  if (countErr) throw countErr;
  const total = count ?? 0;

  // 数据查询
  let dataQuery = supabase.from('cards').select('*').eq('deck_id', deckId);
  if (pagination?.search) {
    const kw = `%${pagination.search}%`;
    dataQuery = dataQuery.or(`front.ilike.${kw},back.ilike.${kw}`);
  }
  dataQuery = dataQuery.order('created_at', { ascending: false });

  if (pagination) {
    const { page, pageSize } = pagination;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    dataQuery = dataQuery.range(from, to);
  }

  const { data, error } = await dataQuery;
  if (error) throw error;
  return { data: (data ?? []) as Card[], total };
}

/**
 * 获取单个卡片详情
 */
export async function getCard(id: string): Promise<Card | null> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Card | null;
}

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
export async function updateCard(id: string, input: Partial<CardInput>): Promise<Card> {
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

// ============================================================
// SubTask 4.4: 今日复习队列
// ============================================================

/**
 * 获取今日复习队列：到期卡 + 新卡（前 newCardLimit 张）
 *
 * 简化实现（避免复杂 SQL）：
 * 1. 查该 deck 所有 cards 的 id 列表
 * 2. 查该用户对这些 card 的 card_user_states 中 due <= now 的记录 → 到期卡
 * 3. 查该用户对这些 card 的所有 card_user_states → 已学过的 card_id 集合
 * 4. 新卡 = 该 deck 所有 cards - 已学过的 card_id，取前 newCardLimit 张
 * 5. 用 id 列表去 cards 表查完整数据并合并返回
 *
 * @param deckId 牌组 ID
 * @param newCardLimit 新卡配额（默认 20）
 */
export async function getTodayReviewQueue(deckId: string, newCardLimit = 20): Promise<Card[]> {
  const userId = await getCurrentUserId();
  // 未登录用户直接返回空（RLS 也会拦截 card_user_states 查询）
  if (!userId) return [];

  // 1. 拿到该 deck 所有 card_id
  const { data: deckCards, error: cardsErr } = await supabase
    .from('cards')
    .select('id')
    .eq('deck_id', deckId);
  if (cardsErr) throw cardsErr;
  const allCardIds = (deckCards ?? []).map((c) => c.id);
  if (allCardIds.length === 0) return [];

  // 2. 到期卡：user_id = me AND card_id IN (allCardIds) AND due <= now
  const { data: dueStates, error: dueErr } = await supabase
    .from('card_user_states')
    .select('card_id')
    .eq('user_id', userId)
    .in('card_id', allCardIds)
    .lte('due', new Date().toISOString())
    .order('due', { ascending: true });
  if (dueErr) throw dueErr;
  const dueCardIds = (dueStates ?? []).map((s) => s.card_id);

  // 3. 已学过的 card_id 集合（不带 due 过滤）
  const { data: learnedStates, error: learnedErr } = await supabase
    .from('card_user_states')
    .select('card_id')
    .eq('user_id', userId)
    .in('card_id', allCardIds);
  if (learnedErr) throw learnedErr;
  const learnedSet = new Set((learnedStates ?? []).map((s) => s.card_id));

  // 4. 新卡：未学过的卡片，取前 newCardLimit 张
  const newCardNeeded = Math.max(0, newCardLimit - dueCardIds.length);
  const newCardIds: string[] = [];
  for (const id of allCardIds) {
    if (newCardIds.length >= newCardNeeded) break;
    if (!learnedSet.has(id)) newCardIds.push(id);
  }

  // 5. 合并 id 列表，去 cards 表查完整数据
  const mergedIds = Array.from(new Set([...dueCardIds, ...newCardIds]));
  if (mergedIds.length === 0) return [];

  const { data: fullCards, error: fullErr } = await supabase
    .from('cards')
    .select('*')
    .in('id', mergedIds);
  if (fullErr) throw fullErr;

  // 按到期卡 → 新卡的顺序排列
  const cardMap = new Map((fullCards ?? []).map((c) => [(c as Card).id, c as Card]));
  const result: Card[] = [];
  for (const id of dueCardIds) {
    const c = cardMap.get(id);
    if (c) result.push(c);
  }
  for (const id of newCardIds) {
    const c = cardMap.get(id);
    if (c) result.push(c);
  }
  return result;
}

// ============================================================
// SubTask 4.5: 提交复习
// ============================================================

/**
 * 提交一次复习记录并更新调度状态
 *
 * 1. 获取当前用户
 * 2. 查询现有 card_user_states（user_id = me AND card_id = cardId）
 * 3. 用现有 state 或默认 state 调用 sm2 算法计算新调度
 * 4. upsert card_user_states
 * 5. insert card_reviews
 * 6. 返回更新后的 state 和 review 记录
 *
 * @param cardId 卡片 ID
 * @param mode 复习模式
 * @param quality 回答质量 0-5
 * @param userAnswer 用户作答内容（可选）
 */
export async function submitReview(
  cardId: string,
  mode: ReviewMode,
  quality: number,
  userAnswer?: string,
): Promise<{ state: CardUserState; review: CardReview }> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('未登录，无法提交复习记录');

  // 2. 查询现有 state
  const { data: existing, error: queryErr } = await supabase
    .from('card_user_states')
    .select('*')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .maybeSingle();
  if (queryErr) throw queryErr;

  // 3. 构造 SM2State
  const existingState = existing as CardUserState;
  const prevState: SM2State = existing
    ? {
        ease: existingState.ease,
        interval: existingState.interval_days,
        repetitions: existingState.repetitions,
        lastReviewed: existingState.last_reviewed
          ? new Date(existingState.last_reviewed)
          : null,
      }
    : { ease: 2.5, interval: 0, repetitions: 0, lastReviewed: null };

  // 调用 SM-2 算法
  const result = sm2(prevState, quality);
  const nowIso = new Date().toISOString();

  // 4. upsert card_user_states
  const stateRow = {
    user_id: userId,
    card_id: cardId,
    ease: result.ease,
    interval_days: result.interval,
    repetitions: result.repetitions,
    due: result.due.toISOString(),
    last_reviewed: nowIso,
  };
  const { data: stateData, error: stateErr } = await supabase
    .from('card_user_states')
    .upsert(stateRow, { onConflict: 'user_id,card_id' })
    .select()
    .single();
  if (stateErr) throw stateErr;

  // 5. insert card_reviews
  const { data: reviewData, error: reviewErr } = await supabase
    .from('card_reviews')
    .insert({
      user_id: userId,
      card_id: cardId,
      mode,
      quality,
      user_answer: userAnswer ?? null,
      reviewed_at: nowIso,
    })
    .select()
    .single();
  if (reviewErr) throw reviewErr;

  return {
    state: stateData as CardUserState,
    review: reviewData as CardReview,
  };
}

// ============================================================
// SubTask 4.6: 统计函数
// ============================================================

/**
 * 获取牌组维度统计
 * - total: 该 deck 的卡片总数
 * - learned: 该 user 在该 deck 中有 card_user_states 记录的数量
 * - mastered: state 中 repetitions >= 3 且 interval_days >= 21 的数量
 * - dueToday: state 中 due <= now 的数量
 * - newCards: total - learned
 */
export async function getDeckStats(deckId: string): Promise<DeckStats> {
  // 卡片总数
  const { count: total, error: totalErr } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId);
  if (totalErr) throw totalErr;

  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      total: total ?? 0,
      learned: 0,
      mastered: 0,
      dueToday: 0,
      newCards: total ?? 0,
    };
  }

  // 拿到该 deck 所有 card_id
  const { data: deckCards, error: cardsErr } = await supabase
    .from('cards')
    .select('id')
    .eq('deck_id', deckId);
  if (cardsErr) throw cardsErr;
  const cardIds = (deckCards ?? []).map((c) => c.id);
  if (cardIds.length === 0) {
    return { total: 0, learned: 0, mastered: 0, dueToday: 0, newCards: 0 };
  }

  // 拉取该用户在这些 card 上的所有 state
  const { data: states, error: statesErr } = await supabase
    .from('card_user_states')
    .select('*')
    .eq('user_id', userId)
    .in('card_id', cardIds);
  if (statesErr) throw statesErr;

  const stateList = (states ?? []) as CardUserState[];
  const learned = stateList.length;
  const nowIso = new Date().toISOString();
  const mastered = stateList.filter(
    (s) => s.repetitions >= 3 && s.interval_days >= 21,
  ).length;
  const dueToday = stateList.filter((s) => s.due <= nowIso).length;

  return {
    total: total ?? 0,
    learned,
    mastered,
    dueToday,
    newCards: (total ?? 0) - learned,
  };
}

/**
 * 批量获取多个牌组的统计（替代逐 deck 调用 getDeckStats，消除 N+1）
 *
 * 实现：2 次查询
 * 1. cards 表按 deck_id IN (...) 拉全部卡的 id, deck_id（按 deck 分组得 total）
 * 2. card_user_states 表按 card_id IN (...) + user_id 拉状态（按 card_id 映射回 deck_id 聚合得 learned/mastered/dueToday）
 *
 * @param deckIds 牌组 ID 列表
 * @returns Map<deckId, DeckStats>
 */
export async function getDeckStatsBulk(
  deckIds: string[],
): Promise<Map<string, DeckStats>> {
  const result = new Map<string, DeckStats>();
  if (deckIds.length === 0) return result;

  // 查询1：拉所有 deck 的卡片 id + deck_id
  const { data: cards, error: cardsErr } = await supabase
    .from('cards')
    .select('id, deck_id')
    .in('deck_id', deckIds);
  if (cardsErr) throw cardsErr;

  const cardList = (cards ?? []) as Array<{ id: string; deck_id: string }>;
  // cardId → deckId 映射；同时按 deck 聚合 total
  const cardIdToDeckId = new Map<string, string>();
  const totalByDeck = new Map<string, number>();
  for (const c of cardList) {
    cardIdToDeckId.set(c.id, c.deck_id);
    totalByDeck.set(c.deck_id, (totalByDeck.get(c.deck_id) ?? 0) + 1);
  }

  // 初始化每个 deck 的统计（确保无卡 / 无 state 的 deck 也有 entry）
  // 未登录用户：learned/mastered/dueToday 全 0，newCards = total
  const userId = await getCurrentUserId();
  if (!userId || cardIdToDeckId.size === 0) {
    for (const deckId of deckIds) {
      const total = totalByDeck.get(deckId) ?? 0;
      result.set(deckId, {
        total,
        learned: 0,
        mastered: 0,
        dueToday: 0,
        newCards: total,
      });
    }
    return result;
  }

  // 查询2：拉该用户在这些 card 上的所有 state
  const allCardIds = Array.from(cardIdToDeckId.keys());
  const { data: states, error: statesErr } = await supabase
    .from('card_user_states')
    .select('card_id, repetitions, interval_days, due')
    .eq('user_id', userId)
    .in('card_id', allCardIds);
  if (statesErr) throw statesErr;

  const stateList = (states ?? []) as Array<{
    card_id: string;
    repetitions: number;
    interval_days: number;
    due: string;
  }>;

  // 按 deck 聚合 learned / mastered / dueToday
  const learnedByDeck = new Map<string, number>();
  const masteredByDeck = new Map<string, number>();
  const dueByDeck = new Map<string, number>();
  const nowIso = new Date().toISOString();

  for (const s of stateList) {
    const deckId = cardIdToDeckId.get(s.card_id);
    if (!deckId) continue;
    learnedByDeck.set(deckId, (learnedByDeck.get(deckId) ?? 0) + 1);
    if (s.repetitions >= 3 && s.interval_days >= 21) {
      masteredByDeck.set(deckId, (masteredByDeck.get(deckId) ?? 0) + 1);
    }
    if (s.due <= nowIso) {
      dueByDeck.set(deckId, (dueByDeck.get(deckId) ?? 0) + 1);
    }
  }

  // 写回结果
  for (const deckId of deckIds) {
    const total = totalByDeck.get(deckId) ?? 0;
    const learned = learnedByDeck.get(deckId) ?? 0;
    const mastered = masteredByDeck.get(deckId) ?? 0;
    const dueToday = dueByDeck.get(deckId) ?? 0;
    result.set(deckId, {
      total,
      learned,
      mastered,
      dueToday,
      newCards: total - learned,
    });
  }

  return result;
}

/**
 * 获取用户在背诵模块的整体统计
 * - dueToday: 该 user 所有 due <= now 的 state 数量
 * - newToday: 默认配额 20（简化处理）
 * - mastered: 该 user 所有 state 中 repetitions >= 3 且 interval_days >= 21 的数量
 * - totalCards: 所有 public deck + 自己 private deck 的卡片总数
 *
 * 优化：用 head:true count 查询替代拉全量 state 到前端聚合
 */
export async function getUserMemoryStats(): Promise<MemoryStats> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { dueToday: 0, newToday: 20, mastered: 0, totalCards: 0 };
  }

  const nowIso = new Date().toISOString();

  // 并行 3 次 count 查询（只返回数字，不拉全量行）
  const [dueRes, masteredRes, decksRes] = await Promise.all([
    // dueToday：到期卡数
    supabase
      .from('card_user_states')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('due', nowIso),
    // mastered：已掌握卡数
    supabase
      .from('card_user_states')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('repetitions', 3)
      .gte('interval_days', 21),
    // 可见 deck id 列表
    supabase
      .from('decks')
      .select('id')
      .or(`visibility.eq.public,creator_id.eq.${userId}`),
  ]);

  if (dueRes.error) throw dueRes.error;
  if (masteredRes.error) throw masteredRes.error;
  if (decksRes.error) throw decksRes.error;

  const dueToday = dueRes.count ?? 0;
  const mastered = masteredRes.count ?? 0;

  // 统计可见 deck 的卡片总数
  const deckIds = (decksRes.data ?? []).map((d: { id: string }) => d.id);
  let totalCards = 0;
  if (deckIds.length > 0) {
    const { count, error: cardsErr } = await supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .in('deck_id', deckIds);
    if (cardsErr) throw cardsErr;
    totalCards = count ?? 0;
  }

  return {
    dueToday,
    newToday: 20,
    mastered,
    totalCards,
  };
}

/**
 * 获取最近 N 天的复习历史（按天聚合）
 *
 * 简化实现：查询最近 N 天的 card_reviews，前端按 reviewed_at 的日期分组计数
 * 缺失日期补 0
 *
 * @param days 天数，默认 7
 * @returns [{ date: 'YYYY-MM-DD', count: N }, ...]
 */
export async function getReviewHistory(days = 7): Promise<ReviewHistoryItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  // 计算起始日期（含今天，共 days 天）
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('card_reviews')
    .select('reviewed_at')
    .eq('user_id', userId)
    .gte('reviewed_at', start.toISOString())
    .order('reviewed_at', { ascending: true });
  if (error) throw error;

  // 初始化每天 0 条
  const dateMap = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dateMap.set(formatDate(d), 0);
  }

  // 按 reviewed_at 的日期分组计数
  for (const row of data ?? []) {
    const dateStr = formatDate(new Date(row.reviewed_at));
    if (dateMap.has(dateStr)) {
      dateMap.set(dateStr, (dateMap.get(dateStr) ?? 0) + 1);
    }
  }

  return Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }));
}

/**
 * 将 Date 格式化为 YYYY-MM-DD（本地时区）
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ============================================================
// SubTask 5: RPC 聚合调用
// ============================================================

/**
 * 获取背诵模块首页聚合数据（一次 RPC 调用返回统计 + 我的牌组 + 公开牌组）
 *
 * 对应 SQL：`public.get_memory_home_data()`
 *
 * @returns { stats: MemoryStats; myDecks: DeckWithStats[]; publicDecks: DeckWithStats[] }
 * @throws RPC 调用失败时抛出异常
 */
export async function fetchMemoryHomeData(): Promise<{
  stats: MemoryStats;
  myDecks: DeckWithStats[];
  publicDecks: DeckWithStats[];
}> {
  const { data, error } = await supabase.rpc('get_memory_home_data');
  if (error) throw error;

  const raw = data as unknown as {
    stats: MemoryStats;
    my_decks: Array<{
      id: string;
      name: string;
      description: string | null;
      lang: string;
      card_type: string;
      visibility: string;
      total: number;
      learned: number;
      mastered: number;
      dueToday: number;
      newCards: number;
    }>;
    public_decks: Array<{
      id: string;
      name: string;
      description: string | null;
      lang: string;
      card_type: string;
      visibility: string;
      total: number;
      learned: number;
      mastered: number;
      dueToday: number;
      newCards: number;
    }>;
  };

  const mapDeck = (row: typeof raw.my_decks[number]): DeckWithStats => ({
    id: row.id,
    name: row.name,
    description: row.description,
    lang: row.lang as DeckWithStats['lang'],
    card_type: row.card_type as DeckWithStats['card_type'],
    visibility: row.visibility as DeckWithStats['visibility'],
    creator_id: null,
    created_at: '',
    updated_at: '',
    total: row.total,
    learned: row.learned,
    mastered: row.mastered,
    dueToday: row.dueToday,
    newCards: row.newCards,
  });

  return {
    stats: raw.stats,
    myDecks: (raw.my_decks ?? []).map(mapDeck),
    publicDecks: (raw.public_decks ?? []).map(mapDeck),
  };
}

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
    creator_id: null,
    created_at: '',
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
