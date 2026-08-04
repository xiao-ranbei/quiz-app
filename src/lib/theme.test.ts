import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyModeToDocument } from './theme';

// vitest 以项目根目录为 cwd
const globalsCss = readFileSync('src/styles/globals.css', 'utf-8');

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

describe('globals.css 品牌变量格式', () => {
  it('--brand-* 使用空格分隔的 RGB 三元组（供 rgb(var(--brand-XX)/alpha) 使用，不能是十六进制）', () => {
    const matches = globalsCss.matchAll(/--brand-(\d{2,3}):\s*([^;]+);/g);
    const values = [...matches].map((m) => m[2].trim());
    // 默认紫色 + memory 绿色两套 10 色阶
    expect(values.length).toBeGreaterThanOrEqual(20);
    for (const v of values) {
      expect(v).toMatch(/^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/);
    }
  });

  it('--brand-accent 需包装为 rgb(var(--brand-...))，不能是裸三元组或十六进制', () => {
    const accentDefs = globalsCss.match(/--brand-accent:\s*([^;]+);/g);
    expect(accentDefs?.length).toBeGreaterThanOrEqual(2); // 浅色 + 深色
    for (const def of accentDefs ?? []) {
      expect(def).toMatch(/rgb\(var\(--brand-(700|400)\)\)/);
    }
  });
});
