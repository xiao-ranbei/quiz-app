import { beforeEach, describe, expect, it } from 'vitest';
import { applyModeToDocument } from './theme';

beforeEach(() => {
  delete document.documentElement.dataset.mode;
});

describe('applyModeToDocument', () => {
  it('memory 模式设置 data-mode="memory"', () => {
    applyModeToDocument('memory');
    expect(document.documentElement.dataset.mode).toBe('memory');
  });

  it('quiz 模式设置 data-mode="quiz"', () => {
    applyModeToDocument('quiz');
    expect(document.documentElement.dataset.mode).toBe('quiz');
  });

  it('null 时删除 data-mode 属性', () => {
    document.documentElement.dataset.mode = 'memory';
    applyModeToDocument(null);
    expect(document.documentElement.dataset.mode).toBeUndefined();
  });
});
