import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';

/**
 * 获取当前登录用户 ID
 * 优先从 authStore 读取，避免每次调用 auth.getUser() 网络往返
 */
export async function getCurrentUserId(): Promise<string | null> {
  // 优先从 Zustand store 读取（同步，无网络请求）
  const storeUser = useAuthStore.getState().user;
  if (storeUser?.id) return storeUser.id;
  // 降级：store 未初始化时回退到 auth.getUser()
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
