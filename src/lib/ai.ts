import { supabase } from './supabase';
import type { AIConfig, Question } from '../types';

export async function getAIConfig(userId: string): Promise<AIConfig | null> {
  const { data, error } = await supabase
    .from('user_ai_configs')
    .select('api_base_url, api_key, model')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as AIConfig | null;
}

export async function saveAIConfig(
  userId: string,
  config: Omit<AIConfig, 'id'>,
): Promise<void> {
  const { error } = await supabase.from('user_ai_configs').upsert(
    {
      user_id: userId,
      api_base_url: config.api_base_url,
      api_key: config.api_key,
      model: config.model,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id', ignoreDuplicates: false },
  );
  if (error) throw error;
}

export async function testAIConnection(config: Omit<AIConfig, 'id'>): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke('ai-test-connection', {
    body: config,
  });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; message?: string; error?: string };
}

export async function resolveQuestionAI(params: {
  question: Question;
  userAnswer?: string;
}): Promise<{ resolution: string; cached: boolean }> {
  const { data, error } = await supabase.functions.invoke('ai-resolve', {
    body: {
      question_id: params.question.id,
      question: params.question.question,
      type: params.question.type,
      options: params.question.options,
      answer: params.question.answer,
      explanation: params.question.explanation,
      user_answer: params.userAnswer,
    },
  });
  if (error) throw new Error(error.message);
  return data as { resolution: string; cached: boolean };
}

export async function generateQuestions(params: {
  topic: string;
  count?: number;
  difficulty?: 1 | 2 | 3;
  type?: 'choice' | 'fill';
}): Promise<Array<{
  question: string;
  options?: Record<string, string>;
  answer: string;
  explanation?: string;
}>> {
  const { data, error } = await supabase.functions.invoke('ai-generate', { body: params });
  if (error) throw new Error(error.message);
  return (data as { questions: Array<{ question: string; options?: Record<string, string>; answer: string; explanation?: string }> }).questions;
}
