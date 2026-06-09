import { create } from 'zustand';
import type { Question } from '../types';

export interface ExamAnswer {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
}

interface ExamState {
  title: string;
  questions: Question[];
  currentIndex: number;
  userAnswers: Record<string, string>;
  timeLimitSec: number;
  startedAt: number;
  submitted: boolean;
  start: (params: { title: string; questions: Question[]; timeLimitSec: number }) => void;
  setAnswer: (questionId: string, answer: string) => void;
  goTo: (index: number) => void;
  submit: () => void;
  reset: () => void;
}

export const useExamStore = create<ExamState>((set) => ({
  title: '',
  questions: [],
  currentIndex: 0,
  userAnswers: {},
  timeLimitSec: 0,
  startedAt: 0,
  submitted: false,
  start: ({ title, questions, timeLimitSec }) =>
    set({
      title,
      questions,
      currentIndex: 0,
      userAnswers: {},
      timeLimitSec,
      startedAt: Date.now(),
      submitted: false,
    }),
  setAnswer: (questionId, answer) =>
    set((s) => ({
      userAnswers: { ...s.userAnswers, [questionId]: answer },
    })),
  goTo: (index) => set({ currentIndex: index }),
  submit: () => set({ submitted: true }),
  reset: () =>
    set({
      title: '',
      questions: [],
      currentIndex: 0,
      userAnswers: {},
      timeLimitSec: 0,
      startedAt: 0,
      submitted: false,
    }),
}));
