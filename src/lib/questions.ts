import { supabase } from './supabase';
import type {
  Category,
  Question,
  QuestionType,
  Difficulty,
  UserHistory,
  WrongBookItem,
  ExamSession,
} from '../types';

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
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
  if (params.keyword) query = query.ilike('question', `%${params.keyword}%`);

  if (params.random) {
    query = query.order('random()');
  } else {
    query = query.order('created_at', { ascending: false });
  }

  if (params.limit) query = query.limit(params.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
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
  return data as Category;
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
    for (const a of params.answers) {
      if (!a.isCorrect) {
        await supabase.rpc('upsert_wrong_book', {
          p_user_id: params.userId,
          p_question_id: a.questionId,
        });
      }
    }
  }

  return { sessionId, score };
}

export async function getUserStats(userId: string): Promise<{
  totalAnswered: number;
  correct: number;
  wrongCount: number;
  examCount: number;
}> {
  const [historyRes, wrongRes, examRes] = await Promise.all([
    supabase
      .from('user_history')
      .select('is_correct', { count: 'exact' })
      .eq('user_id', userId),
    supabase.from('wrong_book').select('id', { count: 'exact' }).eq('user_id', userId),
    supabase
      .from('exam_sessions')
      .select('id', { count: 'exact' })
      .eq('user_id', userId),
  ]);

  const history = (historyRes.data ?? []) as Array<{ is_correct: boolean }>;
  return {
    totalAnswered: history.length,
    correct: history.filter((h) => h.is_correct).length,
    wrongCount: wrongRes.count ?? 0,
    examCount: examRes.count ?? 0,
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
