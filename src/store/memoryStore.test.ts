import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryStore } from './memoryStore';
import type { Card } from '../types';

const reviewMock = vi.hoisted(() => ({
  fetchStudyQueue: vi.fn(),
  submitReviewRpc: vi.fn(),
}));

vi.mock('../lib/memory/review', () => reviewMock);

const card: Card = {
  id: 'c1',
  deck_id: 'deck1',
  front: 'ねこ',
  back: '猫',
  metadata: {},
  tags: [],
  creator_id: null,
  created_at: '',
};

beforeEach(() => {
  useMemoryStore.getState().reset();
  vi.clearAllMocks();
});

describe('memoryStore.start', () => {
  it('空队列时 isFinished 为 false（页面应显示“今日已完成”）', async () => {
    reviewMock.fetchStudyQueue.mockResolvedValue([]);
    await useMemoryStore.getState().start('deck1', 'flashcard');
    const s = useMemoryStore.getState();
    expect(s.queue).toEqual([]);
    expect(s.isFinished).toBe(false);
    expect(s.isLoading).toBe(false);
  });

  it('next 将进度写入 sessionStorage，restore 可恢复', async () => {
    reviewMock.fetchStudyQueue.mockResolvedValue([
      card,
      { ...card, id: 'c2', front: '犬', back: '狗' },
    ]);
    await useMemoryStore.getState().start('deck1', 'flashcard');
    useMemoryStore.getState().next();
    expect(useMemoryStore.getState().currentIndex).toBe(1);

    const saved = JSON.parse(
      sessionStorage.getItem('memory-study-session') ?? 'null',
    );
    expect(saved.currentIndex).toBe(1);
    expect(saved.deckId).toBe('deck1');

    // 模拟刷新：清空 store 状态但保留 sessionStorage
    useMemoryStore.setState({
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
    useMemoryStore.getState().restore();
    expect(useMemoryStore.getState().currentIndex).toBe(1);
    expect(useMemoryStore.getState().deckId).toBe('deck1');
  });
});
