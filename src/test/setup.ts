import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom 不实现媒体播放，stub HTMLMediaElement.play 以便断言播放调用
Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
