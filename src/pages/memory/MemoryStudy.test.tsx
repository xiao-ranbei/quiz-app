import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MemoryStudy from './MemoryStudy';
import { useMemoryStore } from '../../store/memoryStore';
import type { Card } from '../../types';

// Mock 数据源，避免真实网络请求
const cardsMock = vi.hoisted(() => ({
  fetchStudyQueue: vi.fn(),
  getDeck: vi.fn(),
}));
const apkgMock = vi.hoisted(() => ({
  extractAudio: vi.fn(),
}));

vi.mock('../../lib/cards', () => cardsMock);
vi.mock('../../lib/apkg-import', () => apkgMock);

const card: Card = {
  id: 'c1',
  deck_id: 'deck1',
  front: 'ねこ',
  back: '猫',
  metadata: {
    reading: 'ねこ',
    audio: 'neko.mp3',
  },
  tags: [],
  creator_id: null,
  created_at: '',
};

beforeEach(() => {
  cardsMock.fetchStudyQueue.mockResolvedValue([card]);
  cardsMock.getDeck.mockResolvedValue({
    id: 'deck1',
    name: '测试牌组',
    description: null,
    lang: 'ja',
    card_type: 'word',
    visibility: 'public',
    creator_id: null,
    metadata: {},
    created_at: '',
    updated_at: '',
  });
  apkgMock.extractAudio.mockResolvedValue(
    'https://cdn.example.com/audio/neko.mp3',
  );
  useMemoryStore.getState().reset();
});

function renderStudy() {
  return render(
    <MemoryRouter initialEntries={['/memory/study/deck1?mode=flashcard']}>
      <Routes>
        <Route path="/memory/study/:deckId" element={<MemoryStudy />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('闪卡模式音频播放', () => {
  it('点击音频按钮应播放音频，且不应翻转卡片', async () => {
    const user = userEvent.setup();
    renderStudy();

    // 等待复习队列加载完成，正面显示读音和音频按钮
    await waitFor(() => {
      expect(screen.getByText('正面')).toBeTruthy();
    });

    const playBtn = screen.getByTitle(/播放音频/);
    await user.click(playBtn);

    // 点击音频不应触发卡片翻转（仍停留在正面）
    expect(screen.queryByText('背面（答案）')).toBeNull();
    expect(useMemoryStore.getState().isFlipped).toBe(false);

    // 音频应被提取并开始播放
    await waitFor(() => {
      expect(apkgMock.extractAudio).toHaveBeenCalledWith('deck1', 'neko.mp3');
      expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });
  });

  it('背面例句音频按钮应播放音频，且不会把卡片翻回正面', async () => {
    const cardWithExample: Card = {
      ...card,
      metadata: {
        example: '猫はかわいい',
        example_audio: 'example.mp3',
      },
    };
    cardsMock.fetchStudyQueue.mockResolvedValue([cardWithExample]);

    const user = userEvent.setup();
    renderStudy();

    await waitFor(() => {
      expect(screen.getByText('正面')).toBeTruthy();
    });

    // 点击卡片主体翻转
    await user.click(screen.getByRole('button', { name: '翻转卡片' }));
    expect(screen.getByText('背面（答案）')).toBeTruthy();

    // 点击背面例句音频
    await user.click(screen.getByTitle(/播放音频/));

    // 播放时不应把卡片翻回正面
    expect(screen.queryByText('正面')).toBeNull();
    expect(useMemoryStore.getState().isFlipped).toBe(true);

    await waitFor(() => {
      expect(apkgMock.extractAudio).toHaveBeenCalledWith('deck1', 'example.mp3');
      expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });
  });
});

describe('空队列状态', () => {
  it('队列为空时显示“今日已完成”，而不是完成总结页', async () => {
    cardsMock.fetchStudyQueue.mockResolvedValue([]);
    renderStudy();

    await waitFor(() => {
      expect(screen.getByText('今日已完成')).toBeTruthy();
    });
    expect(screen.queryByText(/本轮完成/)).toBeNull();
  });
});
