import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration: number; // 毫秒；0 表示不自动消失
}

interface ToastState {
  toasts: ToastItem[];
  push: (type: ToastType, message: string, duration?: number) => string;
  remove: (id: string) => void;
  clear: () => void;
}

let counter = 0;
function genId(): string {
  counter += 1;
  return `toast_${Date.now()}_${counter}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  // 推送一条 toast，返回其 id，便于外部主动关闭
  push: (type, message, duration = 3000) => {
    const id = genId();
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }],
    }));
    // 自动消失
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// 便捷快捷函数（非 React 组件内也可用）
export const toast = {
  success: (msg: string, duration?: number) => useToastStore.getState().push('success', msg, duration),
  error: (msg: string, duration?: number) => useToastStore.getState().push('error', msg, duration),
  info: (msg: string, duration?: number) => useToastStore.getState().push('info', msg, duration),
  warning: (msg: string, duration?: number) => useToastStore.getState().push('warning', msg, duration),
};
