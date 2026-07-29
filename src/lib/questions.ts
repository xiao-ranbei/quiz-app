import { supabase } from './supabase';
import { getCached, invalidate } from './cache';
import type {
  Category,
  Question,
  QuestionType,
  Difficulty,
  UserHistory,
  WrongBookItem,
  ExamSession,
} from '../types';

// 分类列表缓存 key 与 TTL（5 分钟）
const CATEGORIES_CACHE_KEY = 'categories';
const CATEGORIES_TTL = 5 * 60 * 1000;

export async function getCategories(): Promise<Category[]> {
  return getCached(
    CATEGORIES_CACHE_KEY,
    async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    CATEGORIES_TTL,
  );
}

/**
 * 主动失效分类缓存（在新增/删除分类后调用）
 */
export function invalidateCategories(): void {
  invalidate(CATEGORIES_CACHE_KEY);
}

export async function getQuestions(params: {
  categoryId?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  keyword?: string;
  limit?: number;
  random?: boolean;
} = {}): Promise<Question[]> {
  let query = supabase.from('questions').select('*');

  if (params.categoryId) query = query.eq('category_id', params.categoryId);
  if (params.difficulty) query = query.eq('difficulty', params.difficulty);
  if (params.type) query = query.eq('type', params.type);
  if (params.keyword) query = query.ilike('"question"', `%${params.keyword}%`);

  if (params.random) {
    // PostgREST 不支持 order('random()')，改为前端打乱
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  let result = data ?? [];
  if (params.random) {
    result = result.sort(() => Math.random() - 0.5);
  }
  if (params.limit) result = result.slice(0, params.limit);
  return result;
}

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .in('id', ids);
  if (error) throw error;
  // 按原始 id 顺序排列
  const map = new Map((data ?? []).map((q) => [q.id, q]));
  return ids.map((id) => map.get(id)).filter(Boolean) as Question[];
}

export async function getQuestionCount(params: {
  categoryId?: string;
  difficulty?: Difficulty;
} = {}): Promise<number> {
  let query = supabase.from('questions').select('id', { count: 'exact', head: true });
  if (params.categoryId) query = query.eq('category_id', params.categoryId);
  if (params.difficulty) query = query.eq('difficulty', params.difficulty);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function insertQuestion(
  q: Omit<Question, 'id' | 'created_at' | 'ai_resolution'>,
): Promise<Question> {
  const { data, error } = await supabase
    .from('questions')
    .insert({
      category_id: q.category_id,
      difficulty: q.difficulty,
      type: q.type,
      question: q.question,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      reference_url: q.reference_url,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Question;
}

export async function insertQuestionsBulk(
  items: Array<Omit<Question, 'id' | 'created_at' | 'ai_resolution'>>,
): Promise<Question[]> {
  const { data, error } = await supabase.from('questions').insert(items).select();
  if (error) throw error;
  return (data ?? []) as Question[];
}

export async function insertCategory(name: string, description?: string): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, description })
    .select()
    .single();
  if (error) throw error;
  invalidateCategories();
  return data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
  invalidateCategories();
}

export async function updateQuestion(
  id: string,
  updates: Partial<Pick<Question, 'category_id' | 'difficulty' | 'type' | 'question' | 'options' | 'answer' | 'explanation' | 'reference_url'>>,
): Promise<Question> {
  const { data, error } = await supabase
    .from('questions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Question;
}

export async function getCategoryByName(name: string): Promise<Category | null> {
  const { data, error } = await supabase
    .from('categories')
    .select()
    .ilike('name', name.trim())
    .maybeSingle();
  if (error) throw error;
  return data as Category | null;
}

export async function getOrCreateCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  const existing = await getCategoryByName(trimmed);
  if (existing) return existing;
  return insertCategory(trimmed);
}

export async function getCategoryQuestionCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('get_category_question_counts');
  if (error) throw error;
  const counts = new Map<string, number>();
  (data ?? []).forEach((row: { category_id: string; count: number }) => {
    counts.set(row.category_id, Number(row.count));
  });
  return counts;
}

export async function savePracticeRecord(params: {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  userId?: string;
}): Promise<void> {
  if (!params.userId) return;
  await supabase.from('user_history').insert({
    user_id: params.userId,
    question_id: params.questionId,
    user_answer: params.userAnswer,
    is_correct: params.isCorrect,
    mode: 'practice',
  });

  if (!params.isCorrect) {
    await supabase.rpc('upsert_wrong_book', {
      p_user_id: params.userId,
      p_question_id: params.questionId,
    });
  }
}

export async function saveExamSession(params: {
  userId?: string;
  title: string;
  total: number;
  timeLimitSec: number;
  answers: Array<{ questionId: string; userAnswer: string; isCorrect: boolean }>;
}): Promise<{ sessionId: string; score: number }> {
  const sessionId = crypto.randomUUID();
  const score = params.answers.filter((a) => a.isCorrect).length;

  const { error: sessionErr } = await supabase.from('exam_sessions').insert({
    id: sessionId,
    user_id: params.userId,
    title: params.title,
    total_questions: params.total,
    time_limit_sec: params.timeLimitSec,
    submitted_at: new Date().toISOString(),
    score,
  });
  if (sessionErr) throw sessionErr;

  if (params.userId) {
    await supabase.from('user_history').insert(
      params.answers.map((a) => ({
        user_id: params.userId,
        question_id: a.questionId,
        user_answer: a.userAnswer,
        is_correct: a.isCorrect,
        mode: 'exam',
        session_id: sessionId,
      })),
    );
    const wrongAnswers = params.answers.filter((a) => !a.isCorrect);
    await Promise.all(
      wrongAnswers.map((a) =>
        supabase.rpc('upsert_wrong_book', {
          p_user_id: params.userId,
          p_question_id: a.questionId,
        }),
      ),
    );
  }

  return { sessionId, score };
}

export async function getUserStats(userId: string): Promise<{
  totalAnswered: number;
  correct: number;
  wrongCount: number;
  examCount: number;
}> {
  const { data, error } = await supabase.rpc('get_user_stats', { p_user_id: userId });
  if (error) throw error;
  if (!data || data.length === 0) {
    return { totalAnswered: 0, correct: 0, wrongCount: 0, examCount: 0 };
  }
  const row = data[0];
  return {
    totalAnswered: Number(row.total_answered),
    correct: Number(row.correct),
    wrongCount: Number(row.wrong_count),
    examCount: Number(row.exam_count),
  };
}

export async function getWrongBook(userId: string, includeQuestion = true): Promise<WrongBookItem[]> {
  const { data, error } = await supabase
    .from('wrong_book')
    .select(includeQuestion ? '*, question:questions(*)' : '*')
    .eq('user_id', userId)
    .order('last_wrong_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as WrongBookItem[];
}

export async function toggleWrongBookMastered(id: string, mastered: boolean): Promise<void> {
  const { error } = await supabase
    .from('wrong_book')
    .update({ mastered })
    .eq('id', id);
  if (error) throw error;
}

export async function getExamSessions(userId: string): Promise<ExamSession[]> {
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data as ExamSession[];
}

// 管理员邮箱列表 - 只有这些邮箱可以删除题目
const ADMIN_EMAILS = new Set(['xiao_ranbei@outlook.com']);

// 管理员判定缓存：按 user.id 缓存，TTL 30 分钟（覆盖一次登录会话）
const ADMIN_TTL = 30 * 60 * 1000;

/**
 * 判断当前登录用户是否为管理员
 * 1) 检查 user_profiles 表是否标记为 admin
 * 2) 或检查邮箱是否在白名单中
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return false;
  const userId = data.user.id;
  const cacheKey = `admin:${userId}`;
  return getCached(
    cacheKey,
    async () => {
      const email = data.user.email?.toLowerCase() ?? '';
      if (ADMIN_EMAILS.has(email)) return true;
      // 尝试从 user_profiles 表读取 role_key（若迁移已启用）
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role_key')
          .eq('id', userId)
          .maybeSingle();
        if (profile && (profile as any).role_key === 'admin') return true;
      } catch {
        // 表不存在或无权限时忽略
      }
      return false;
    },
    ADMIN_TTL,
  );
}

/**
 * 删除题目（仅管理员可操作，Supabase RLS 会二次校验）
 */
export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) throw error;
}

/**
 * 批量删除题目（仅管理员可操作）
 */
export async function deleteQuestionsBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('questions').delete().in('id', ids);
  if (error) throw error;
}

// ============================================================
// 聚合 RPC 调用层（减少页面加载时的请求次数）
// ============================================================

/**
 * 获取首页数据（题目总数 + 分类计数）
 * 替代 getQuestionCount + getCategoryQuestionCounts
 */
export async function fetchHomeData(): Promise<{
  totalQuestions: number;
  categoryCounts: Map<string, number>;
}> {
  const { data, error } = await supabase.rpc('get_home_data');
  if (error) throw error;
  const raw = data as { totalQuestions: number; categoryCounts: Array<{ category_id: string; count: number }> };
  const counts = new Map<string, number>();
  (raw.categoryCounts ?? []).forEach((row) => {
    counts.set(row.category_id, Number(row.count));
  });
  return { totalQuestions: raw.totalQuestions ?? 0, categoryCounts: counts };
}

/**
 * 获取 DeckDetail 页面数据（牌组+统计+历史+分页卡片）
 * 替代 getDeck + getDeckStats + getReviewHistory + getCards
 */
export async function fetchDeckDetailData(
  deckId: string,
  page: number = 1,
  pageSize: number = 20,
  search?: string,
): Promise<{
  deck: import('../types').Deck | null;
  stats: import('../types').DeckStats;
  reviewHistory: import('../types').ReviewHistoryItem[];
  cards: { data: import('../types').Card[]; total: number };
}> {
  const { data, error } = await supabase.rpc('get_deck_detail', {
    p_deck_id: deckId,
    p_page: page,
    p_page_size: pageSize,
    p_search: search ?? null,
  });
  if (error) throw error;
  const raw = data as any;
  return {
    deck: raw.deck ? {
      id: raw.deck.id,
      name: raw.deck.name,
      description: raw.deck.description,
      lang: raw.deck.lang,
      card_type: raw.deck.card_type,
      visibility: raw.deck.visibility,
      creator_id: raw.deck.creator_id,
      created_at: raw.deck.created_at,
      updated_at: raw.deck.updated_at,
    } : null,
    stats: {
      total: raw.stats?.total ?? 0,
      learned: raw.stats?.learned ?? 0,
      mastered: raw.stats?.mastered ?? 0,
      dueToday: raw.stats?.dueToday ?? 0,
      newCards: raw.stats?.newCards ?? 0,
    },
    reviewHistory: (raw.reviewHistory ?? []) as import('../types').ReviewHistoryItem[],
    cards: {
      data: (raw.cards?.data ?? []) as import('../types').Card[],
      total: raw.cards?.total ?? 0,
    },
  };
}

/**
 * 获取 Profile 页面数据（统计+考试+AI配置）
 * 替代 getUserStats + getExamSessions + getAIConfig
 */
export async function fetchProfileData(): Promise<{
  stats: { totalAnswered: number; correct: number; wrongCount: number; examCount: number } | null;
  examSessions: import('../types').ExamSession[];
  aiConfig: import('../types').AIConfig | null;
}> {
  const { data, error } = await supabase.rpc('get_profile_data');
  if (error) throw error;
  const raw = data as any;
  return {
    stats: raw.stats ?? null,
    examSessions: (raw.examSessions ?? []) as import('../types').ExamSession[],
    aiConfig: raw.aiConfig ?? null,
  };
}

/**
 * 提交考试（一次性完成交卷所有操作）
 * 替代 saveExamSession 中的 2+N 次请求
 */
export async function submitExamSessionRpc(params: {
  userId?: string;
  title: string;
  total: number;
  timeLimitSec: number;
  answers: Array<{ questionId: string; userAnswer: string; isCorrect: boolean }>;
}): Promise<{ sessionId: string; score: number }> {
  if (!params.userId) return { sessionId: '', score: 0 };
  const { data, error } = await supabase.rpc('submit_exam_session', {
    p_user_id: params.userId,
    p_title: params.title,
    p_total: params.total,
    p_time_limit_sec: params.timeLimitSec,
    p_answers: params.answers.map((a) => ({
      question_id: a.questionId,
      user_answer: a.userAnswer,
      is_correct: a.isCorrect,
    })),
  });
  if (error) throw error;
  return data as { sessionId: string; score: number };
}

/**
 * 保存练习记录（一次性完成作答记录）
 * 替代 savePracticeRecord 中的 2 次请求
 */
export async function savePracticeRecordRpc(params: {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  userId?: string;
}): Promise<void> {
  if (!params.userId) return;
  const { error } = await supabase.rpc('save_practice_record', {
    p_user_id: params.userId,
    p_question_id: params.questionId,
    p_user_answer: params.userAnswer,
    p_is_correct: params.isCorrect,
  });
  if (error) throw error;
}
