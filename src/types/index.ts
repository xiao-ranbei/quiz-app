export type Difficulty = 1 | 2 | 3;
export type QuestionType = 'choice' | 'fill';
export type Mode = 'practice' | 'exam';

export interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Question {
  id: string;
  category_id?: string;
  difficulty: Difficulty;
  type: QuestionType;
  question: string;
  options?: Record<string, string>;
  answer: string;
  explanation?: string;
  reference_url?: string;
  ai_resolution?: string;
  creator_id?: string;
  created_at: string;
}

export interface Profile {
  id: string;
  nickname: string;
  created_at: string;
}

export interface UserHistory {
  id: string;
  user_id: string;
  question_id: string;
  user_answer: string;
  is_correct: boolean;
  mode: Mode;
  session_id?: string;
  created_at: string;
}

export interface WrongBookItem {
  id: string;
  user_id: string;
  question_id: string;
  wrong_count: number;
  last_wrong_at: string;
  mastered: boolean;
  created_at: string;
  question?: Question;
}

export interface ExamSession {
  id: string;
  user_id?: string;
  title: string;
  total_questions: number;
  time_limit_sec: number;
  started_at: string;
  submitted_at?: string;
  score?: number;
}

export interface AIConfig {
  id?: string;
  api_base_url: string;
  api_key: string;
  model: string;
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: '简单',
  2: '中等',
  3: '困难',
};

export const TYPE_LABEL: Record<QuestionType, string> = {
  choice: '选择题',
  fill: '填空题',
};
