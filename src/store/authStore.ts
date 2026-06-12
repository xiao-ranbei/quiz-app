import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  setAuth: (session: Session | null, user: User | null) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,
  signIn: async (email, password) => {
    set({ error: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message });
      throw error;
    }
    // 登录成功后立即更新 store，触发页面跳转
    set({ session: data.session ?? null, user: data.user ?? null, loading: false, error: null });
  },
  signUp: async (email, password) => {
    set({ error: null });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: undefined },
    });
    if (error) {
      set({ error: error.message });
      throw error;
    }
    // 注册成功后也更新 store（若 Supabase 自动登录）
    if (data.session) {
      set({ session: data.session, user: data.user ?? null, loading: false, error: null });
    } else {
      set({
        error: '注册成功，请使用邮箱与密码登录。',
      });
    }
  },
  setAuth: (session, user) => set({ session, user, loading: false, error: null }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, error: null });
  },
}));

export function initAuth() {
  // 首次读取
  supabase.auth.getSession().then(({ data }) => {
    useAuthStore.getState().setAuth(data.session ?? null, data.session?.user ?? null);
  });

  // 监听变化
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setAuth(session, session?.user ?? null);
  });
}
