import { supabase } from '../supabase';
import type {
  Deck,
  DeckWithStats,
  MemoryStats,
  RecentReview,
  ReviewHistoryItem,
  ReviewMode,
} from '../../types';
import { getCurrentUserId } from './user';

// 聚合 RPC 返回的牌组行（get_memory_home_data / get_memory_profile_data）
interface MemoryDeckRow {
  id: string;
  name: string;
  description: string | null;
  lang: string;
  card_type: string;
  visibility: string;
  creator_id?: string | null;
  total: number;
  learned: number;
  mastered: number;
  dueToday: number;
  newCards: number;
}

function parseDeckWithStats(row: MemoryDeckRow): DeckWithStats {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    lang: row.lang as DeckWithStats['lang'],
    card_type: row.card_type as DeckWithStats['card_type'],
    visibility: row.visibility as DeckWithStats['visibility'],
    creator_id: row.creator_id,
    total: row.total,
    learned: row.learned,
    mastered: row.mastered,
    dueToday: row.dueToday,
    newCards: row.newCards,
  };
}

// ============================================================
// 聚合统计 RPC + 复习历史 + 最近复习
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
    my_decks: MemoryDeckRow[];
    public_decks: MemoryDeckRow[];
  };

  return {
    stats: raw.stats,
    myDecks: (raw.my_decks ?? []).map(parseDeckWithStats),
    publicDecks: (raw.public_decks ?? []).map(parseDeckWithStats),
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

/**
 * 获取最近 N 条复习记录，JOIN cards 取 front/back
 *
 * @param limit 返回条数，默认 20
 */
export async function getRecentReviews(limit = 20): Promise<RecentReview[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  interface ReviewWithCard {
    id: string;
    card_id: string;
    mode: string;
    quality: number;
    reviewed_at: string;
    cards?: { id: string; front: string; back: string } | null;
  }

  const { data, error } = await supabase
    .from('card_reviews')
    .select('id, card_id, mode, quality, reviewed_at, cards!card_reviews_card_id_fkey(id, front, back)')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: false })
    .limit(limit);

  if (error) {
    // 回退：先查 reviews，再逐个查 cards（若 FK join 语法不兼容）
    const { data: rows, error: err2 } = await supabase
      .from('card_reviews')
      .select('id, card_id, mode, quality, reviewed_at')
      .eq('user_id', userId)
      .order('reviewed_at', { ascending: false })
      .limit(limit);
    if (err2) throw err2;
    if (!rows || rows.length === 0) return [];
    const cardIds = Array.from(new Set(rows.map((r) => r.card_id)));
    const { data: cardRows, error: cErr } = await supabase
      .from('cards')
      .select('id, front, back')
      .in('id', cardIds);
    if (cErr) throw cErr;
    const cardMap = new Map(
      (cardRows ?? []).map((c) => [c.id, { front: c.front, back: c.back }])
    );
    return rows.map((r) => ({
      id: r.id,
      card_id: r.card_id,
      front: cardMap.get(r.card_id)?.front ?? '',
      back: cardMap.get(r.card_id)?.back ?? '',
      mode: r.mode as ReviewMode,
      quality: r.quality,
      reviewed_at: r.reviewed_at,
    }));
  }

  return ((data ?? []) as unknown as ReviewWithCard[]).map((r) => ({
    id: r.id,
    card_id: r.card_id,
    front: r.cards?.front ?? '',
    back: r.cards?.back ?? '',
    mode: r.mode as ReviewMode,
    quality: r.quality,
    reviewed_at: r.reviewed_at,
  }));
}

/**
 * 获取背诵模块 Profile 页聚合数据：一次 RPC 调用返回所有所需数据
 *
 * 对应 SQL：`public.get_memory_profile_data(p_history_days, p_recent_limit)`
 *
 * 若 RPC 未部署，降级为并行 3 次调用：
 *   - fetchMemoryHomeData（stats + myDecks）
 *   - getReviewHistory
 *   - getRecentReviews
 *
 * @returns stats + myDecks + reviewHistory + recentReviews
 */
export async function fetchMemoryProfileData(
  historyDays = 7,
  recentLimit = 20,
): Promise<{
  stats: MemoryStats;
  myDecks: DeckWithStats[];
  reviewHistory: ReviewHistoryItem[];
  recentReviews: RecentReview[];
}> {
  // 优先用 RPC 聚合
  try {
    const { data, error } = await supabase.rpc('get_memory_profile_data', {
      p_history_days: historyDays,
      p_recent_limit: recentLimit,
    });
    if (!error && data) {
      const raw = data as unknown as {
        stats: MemoryStats;
        my_decks: MemoryDeckRow[];
        review_history: ReviewHistoryItem[];
        recent_reviews: RecentReview[];
      };

      return {
        stats: raw.stats,
        myDecks: (raw.my_decks ?? []).map(parseDeckWithStats),
        reviewHistory: raw.review_history ?? [],
        recentReviews: raw.recent_reviews ?? [],
      };
    }
  } catch {
    // RPC 未部署时走降级
  }

  // 降级：并行多次请求
  const [homeRes, reviewHistory, recentReviews] = await Promise.all([
    fetchMemoryHomeData(),
    getReviewHistory(historyDays),
    getRecentReviews(recentLimit),
  ]);
  return {
    stats: homeRes.stats,
    myDecks: homeRes.myDecks,
    reviewHistory,
    recentReviews,
  };
}

/**
 * 获取 DeckDetail 页面数据（牌组 + 统计 + 历史 + 分页卡片）
 *
 * 对应 SQL：`public.get_deck_detail(p_deck_id, p_page, p_page_size, p_search)`
 */
export async function fetchDeckDetailData(
  deckId: string,
  page: number = 1,
  pageSize: number = 20,
  search?: string,
): Promise<{
  deck: Deck | null;
  stats: { total: number; learned: number; mastered: number; dueToday: number; newCards: number };
  reviewHistory: ReviewHistoryItem[];
  cards: { data: import('../../types').Card[]; total: number };
}> {
  const { data, error } = await supabase.rpc('get_deck_detail', {
    p_deck_id: deckId,
    p_page: page,
    p_page_size: pageSize,
    p_search: search ?? null,
  });
  if (error) throw error;
  const raw = data as unknown as {
    deck: {
      id: string;
      name: string;
      description: string | null;
      lang: string;
      card_type: string;
      visibility: string;
      creator_id: string | null;
      created_at: string;
      updated_at?: string;
    } | null;
    stats: {
      total: number;
      learned: number;
      mastered: number;
      dueToday: number;
      newCards: number;
    } | null;
    reviewHistory: ReviewHistoryItem[] | null;
    cards: { data: import('../../types').Card[]; total: number } | null;
  };
  return {
    deck: raw.deck ? {
      id: raw.deck.id,
      name: raw.deck.name,
      description: raw.deck.description,
      lang: raw.deck.lang as Deck['lang'],
      card_type: raw.deck.card_type as Deck['card_type'],
      visibility: raw.deck.visibility as Deck['visibility'],
      creator_id: raw.deck.creator_id,
      created_at: raw.deck.created_at,
      ...(raw.deck.updated_at ? { updated_at: raw.deck.updated_at } : {}),
    } : null,
    stats: {
      total: raw.stats?.total ?? 0,
      learned: raw.stats?.learned ?? 0,
      mastered: raw.stats?.mastered ?? 0,
      dueToday: raw.stats?.dueToday ?? 0,
      newCards: raw.stats?.newCards ?? 0,
    },
    reviewHistory: (raw.reviewHistory ?? []) as ReviewHistoryItem[],
    cards: {
      data: (raw.cards?.data ?? []) as import('../../types').Card[],
      total: raw.cards?.total ?? 0,
    },
  };
}
