export type Difficulty = 1 | 2 | 3;
export type QuestionType = 'choice' | 'multiple' | 'fill';
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
  choice: '单选题',
  multiple: '多选题',
  fill: '填空题',
};

// ============ 背诵模块类型 ============

export type Lang = 'ja' | 'en';
export type CardType = 'word' | 'grammar' | 'sentence';
export type ReviewMode = 'flashcard' | 'choice' | 'typing' | 'dictation';
export type Visibility = 'public' | 'private';

// 卡片元数据 - 日语单词
export interface JaWordMetadata {
  reading?: string;      // 假名注音，如 "ねこ"
  romaji?: string;       // 罗马音，如 "neko"
  example_ja?: string;   // 日语例句
  example_zh?: string;   // 中文例句翻译
}

// 卡片元数据 - 英语单词
export interface EnWordMetadata {
  phonetic?: string;     // 音标，如 "/əˈbændən/"
  pos?: string;          // 词性，如 "verb"、"noun"
  example_en?: string;   // 英语例句
  example_zh?: string;   // 中文例句翻译
}

// 卡片元数据 - 语法
export interface GrammarMetadata {
  example_ja?: string;
  example_en?: string;
  example_zh?: string;
  notes?: string;        // 用法备注
}

// 卡片元数据 - 短句
export interface SentenceMetadata {
  translation?: string;  // 翻译
  notes?: string;
}

export type CardMetadata = JaWordMetadata | EnWordMetadata | GrammarMetadata | SentenceMetadata | Record<string, unknown>;

// 牌组元数据（apkg 导入相关）
export interface DeckMetadata {
  source?: string;            // 来源标记，如 'apkg'
  apkg_path?: string;         // 原始 apkg 在 Storage 中的路径
  anki_deck_id?: number;      // Anki 内部 deck id
  media_map?: Record<string, string>;  // { filename: index } 音频懒加载用
  [key: string]: unknown;
}

// 牌组
export interface Deck {
  id: string;
  name: string;
  description: string | null;
  lang: Lang;
  card_type: CardType;
  visibility: Visibility;
  creator_id: string | null;
  metadata?: DeckMetadata;
  created_at: string;
  updated_at: string;
}

// 卡片
export interface Card {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  metadata: CardMetadata;
  tags: string[];
  creator_id: string | null;
  created_at: string;
}

// 用户调度状态（SM-2）
export interface CardUserState {
  id: string;
  user_id: string;
  card_id: string;
  ease: number;
  interval_days: number;
  repetitions: number;
  due: string;           // ISO timestamp
  last_reviewed: string | null;
}

// 复习日志
export interface CardReview {
  id: string;
  user_id: string;
  card_id: string;
  mode: ReviewMode;
  quality: number;       // 0-5
  user_answer: string | null;
  reviewed_at: string;
}

// 模块首页/个人中心统计
export interface MemoryStats {
  dueToday: number;       // 今日待复习
  newToday: number;       // 今日新卡配额
  mastered: number;       // 已掌握（repetitions >= 3 且 interval >= 21）
  totalCards: number;
  learning: number;       // 在学：已学但未掌握
  studyDays: number;      // 去重复习日期数（学习总天数）
}

/** 最近复习记录：card_reviews JOIN cards */
export interface RecentReview {
  id: string;             // review id
  card_id: string;
  front: string;
  back: string;
  mode: ReviewMode;
  quality: number;        // 0-5
  reviewed_at: string;
}

// 牌组维度统计
export interface DeckStats {
  total: number;
  learned: number;        // 有 state 记录的
  mastered: number;
  dueToday: number;
  newCards: number;
}

// 复习历史（按天聚合）
export interface ReviewHistoryItem {
  date: string;           // YYYY-MM-DD
  count: number;
}

// SM-2 状态
export interface SM2State {
  ease: number;
  interval: number;
  repetitions: number;
  lastReviewed: Date | null;
}

export interface SM2Result extends SM2State {
  due: Date;
}

// 带统计的牌组（聚合 RPC 返回）
export interface DeckWithStats {
  id: string;
  name: string;
  description: string | null;
  lang: Lang;
  card_type: CardType;
  visibility: Visibility;
  creator_id: string | null;
  metadata?: DeckMetadata;
  created_at: string;
  updated_at: string;
  total: number;
  learned: number;
  mastered: number;
  dueToday: number;
  newCards: number;
}

// 牌组筛选
export interface DeckFilter {
  visibility?: Visibility;
  creator_id?: string;
  lang?: Lang;
  card_type?: CardType;
}

// 卡片创建/更新输入
export interface CardInput {
  deck_id: string;
  front: string;
  back: string;
  metadata?: CardMetadata;
  tags?: string[];
}

export interface DeckInput {
  name: string;
  description?: string;
  lang: Lang;
  card_type: CardType;
  visibility?: Visibility;
}

export const LANG_LABEL: Record<Lang, string> = {
  ja: '日语',
  en: '英语',
};

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  word: '单词',
  grammar: '语法',
  sentence: '短句',
};

export const REVIEW_MODE_LABEL: Record<ReviewMode, string> = {
  flashcard: '闪卡',
  choice: '选择题',
  typing: '拼写',
  dictation: '听写',
};

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: '公共',
  private: '私有',
};
