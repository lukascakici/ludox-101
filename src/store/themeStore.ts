import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ludox-theme';

/**
 * Reads the user's OS-level color scheme preference.
 * Used only as the initial value when nothing is persisted yet.
 */
function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Global theme store. Persisted to localStorage so the choice survives reloads.
 * On first visit (no persisted value) it falls back to the OS preference.
 *
 * Applying the theme to the DOM (<html> class) is handled by the `useTheme`
 * hook, keeping this store free of side effects.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: getSystemTheme(),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: STORAGE_KEY },
  ),
);
