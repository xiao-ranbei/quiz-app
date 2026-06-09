import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  setAuth: (session: Session | null, user: User | null) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  setAuth: (session, user) => set({ session, user, loading: false }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
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
