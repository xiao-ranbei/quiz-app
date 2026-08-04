import { create } from 'zustand';
import { Card, ReviewMode } from '../types';
import {
  fetchStudyQueue,
  submitReviewRpc,
} from '../lib/memory/review';
import { toast } from './toastStore';

const SESSION_KEY = 'memory-study-session';

interface MemoryStudyState {
  deckId: string | null;
  queue: Card[];
  currentIndex: number;
  mode: ReviewMode;
  isFlipped: boolean;
  isLoading: boolean;
  error: string | null;
  // 完成统计
  correctCount: number;
  wrongCount: number;
  startTime: number | null;
  // 完成状态
  isFinished: boolean;
}

interface MemoryStudyStore extends MemoryStudyState {
  start: (deckId: string, mode: ReviewMode) => Promise<void>;
  changeMode: (newMode: ReviewMode) => void;
  next: () => void;
  prev: () => void;
  setIndex: (i: number) => void;
  flip: () => void;
  submitReview: (quality: number, userAnswer?: string) => Promise<void>;
  reset: () => void;
  restore: () => void;
}

// 需要持久化到 sessionStorage 的会话字段
interface SessionPayload {
  deckId: string;
  mode: ReviewMode;
  queue: Card[];
  currentIndex: number;
  correctCount: number;
  wrongCount: number;
  startTime: number;
}

// 将关键状态写入 sessionStorage
function saveSession(payload: SessionPayload) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    // 忽略写入异常（如隐私模式或配额超限）
  }
}

// 从 sessionStorage 读取会话
function readSession(): SessionPayload | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionPayload;
  } catch {
    return null;
  }
}

// 将当前 store 状态持久化到 sessionStorage
function persistCurrent(s: MemoryStudyState) {
  saveSession({
    deckId: s.deckId ?? '',
    mode: s.mode,
    queue: s.queue,
    currentIndex: s.currentIndex,
    correctCount: s.correctCount,
    wrongCount: s.wrongCount,
    startTime: s.startTime ?? 0,
  });
}

// 移除 sessionStorage 中的会话
function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 忽略
  }
}

export const useMemoryStore = create<MemoryStudyStore>((set, get) => ({
  deckId: null,
  queue: [],
  currentIndex: 0,
  mode: 'flashcard',
  isFlipped: false,
  isLoading: false,
  error: null,
  correctCount: 0,
  wrongCount: 0,
  startTime: null,
  isFinished: false,

  // 开始一次背诵会话：拉取今日复习队列并初始化状态
  start: async (deckId, mode) => {
    set({ isLoading: true, error: null });
    try {
      const queue = await fetchStudyQueue(deckId);
      const startTime = Date.now();
      const next = {
        deckId,
        mode,
        queue,
        currentIndex: 0,
        isFlipped: false,
        // 空队列不代表"完成"：页面应显示"今日已完成"空状态，而非完成总结页
        isFinished: false,
        correctCount: 0,
        wrongCount: 0,
        startTime,
        isLoading: false,
        error: null,
      };
      set(next);
      persistCurrent(get());
    } catch (e) {
      console.error('加载复习队列失败', e);
      set({ isLoading: false, error: '加载复习队列失败' });
    }
  },

  /**
   * 切换学习模式，不重新拉取队列
   * 仅更新 mode 和相关 UI 状态
   */
  changeMode: (newMode: ReviewMode) => {
    set({ mode: newMode });
  },

  // 下一张：已是最后一张则标记完成
  next: () => {
    set((s) => {
      if (s.currentIndex + 1 >= s.queue.length) {
        return { isFinished: true };
      }
      return { currentIndex: s.currentIndex + 1, isFlipped: false };
    });
    const s = get();
    persistCurrent(s);
  },

  // 上一张：已在第一张则不动
  prev: () => {
    set((s) => {
      if (s.currentIndex <= 0) return s;
      return { currentIndex: s.currentIndex - 1, isFlipped: false };
    });
    const s = get();
    persistCurrent(s);
  },

  // 跳转到指定索引
  setIndex: (i) => {
    set({ currentIndex: i, isFlipped: false });
    const s = get();
    persistCurrent(s);
  },

  // 翻转卡片（不持久化）
  flip: () => set((s) => ({ isFlipped: !s.isFlipped })),

  // 提交本次复习评分并自动进入下一张
  submitReview: async (quality, userAnswer) => {
    const { queue, currentIndex } = get();
    const currentCard = queue[currentIndex];
    if (!currentCard) return;

    try {
      await submitReviewRpc(currentCard.id, get().mode, quality, userAnswer);
      // 更新统计：quality >= 3 视为正确
      set((s) => ({
        correctCount: quality >= 3 ? s.correctCount + 1 : s.correctCount,
        wrongCount: quality < 3 ? s.wrongCount + 1 : s.wrongCount,
        error: null,
      }));
      // 自动进入下一张（next 内部会同步 sessionStorage）
      get().next();
    } catch (e) {
      // 未登录或网络错误：提示用户但不卡住进度（游客可继续学习公共牌组）
      const msg = e instanceof Error && e.message.includes('未登录')
        ? '请登录后记录学习进度'
        : '提交复习记录失败';
      set({ error: msg });
      toast.warning(msg);
      // 仍推进到下一张，避免游客卡住
      get().next();
    }
  },

  // 重置全部状态并清除会话
  reset: () => {
    clearSession();
    set({
      deckId: null,
      queue: [],
      currentIndex: 0,
      mode: 'flashcard',
      isFlipped: false,
      isLoading: false,
      error: null,
      correctCount: 0,
      wrongCount: 0,
      startTime: null,
      isFinished: false,
    });
  },

  // 从 sessionStorage 恢复会话（不恢复 isFlipped，默认为 false）
  restore: () => {
    const session = readSession();
    if (!session) return;
    set({
      deckId: session.deckId,
      mode: session.mode,
      queue: session.queue,
      currentIndex: session.currentIndex,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      startTime: session.startTime,
      isFlipped: false,
    });
  },
}));
