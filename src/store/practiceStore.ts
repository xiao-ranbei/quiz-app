import { create } from 'zustand';
import type { Question } from '../types';

interface PracticeState {
  queue: Question[];
  currentIndex: number;
  showAnswer: boolean;
  start: (questions: Question[]) => void;
  next: () => void;
  prev: () => void;
  reveal: () => void;
  reset: () => void;
}

export const usePracticeStore = create<PracticeState>((set) => ({
  queue: [],
  currentIndex: 0,
  showAnswer: false,
  start: (questions) => set({ queue: questions, currentIndex: 0, showAnswer: false }),
  next: () =>
    set((s) => ({
      currentIndex: Math.min(s.currentIndex + 1, Math.max(s.queue.length - 1, 0)),
      showAnswer: false,
    })),
  prev: () =>
    set((s) => ({
      currentIndex: Math.max(s.currentIndex - 1, 0),
      showAnswer: false,
    })),
  reveal: () => set({ showAnswer: true }),
  reset: () => set({ queue: [], currentIndex: 0, showAnswer: false }),
}));
