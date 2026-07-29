import { create } from 'zustand';

export type AppMode = 'quiz' | 'memory';

const MODE_STORAGE_KEY = 'app-mode';

function getInitialMode(): AppMode | null {
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === 'quiz' || stored === 'memory') return stored;
  return null;
}

interface ModeState {
  mode: AppMode | null;
  setMode: (mode: AppMode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: getInitialMode(),
  setMode: (mode) => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
    set({ mode });
  },
}));
