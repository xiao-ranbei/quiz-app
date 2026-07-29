import { useCallback } from 'react';
import { useAuthStore } from './authStore';
import { useToastStore } from './toastStore';

/**
 * 未登录功能拦截 hook
 *
 * 用法：
 *   const requireAuth = useRequireAuth();
 *   if (!requireAuth()) return;           // 使用默认提示语
 *   if (!requireAuth('请登录后创建牌组')) return;  // 自定义提示语
 *
 * 返回值为 true 表示已登录可继续；false 表示未登录，已弹出提示。
 */
export function useRequireAuth() {
  const user = useAuthStore((s) => s.user);
  const push = useToastStore((s) => s.push);

  return useCallback(
    (message?: string) => {
      if (user) return true;
      push('warning', message ?? '请先登录后再使用此功能', 3000);
      return false;
    },
    [user, push],
  );
}
