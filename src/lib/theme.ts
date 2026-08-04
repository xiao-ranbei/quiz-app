import type { AppMode } from '../store/modeStore';

/**
 * 把当前模式同步到根元素的 data-mode 属性。
 *
 * CSS 通过 `:root[data-mode='memory']` 覆盖 brand 色板，
 * 实现整站主色跟随模式；null（未选模式）时删除属性，回退到默认紫色。
 */
export function applyModeToDocument(mode: AppMode | null): void {
  const root = document.documentElement;
  if (mode) {
    root.dataset.mode = mode;
  } else {
    delete root.dataset.mode;
  }
}
