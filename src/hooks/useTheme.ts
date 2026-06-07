import { useEffect } from 'react';
import { useThemeStore, type Theme } from '@/store/themeStore';

interface UseThemeResult {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Binds the theme store to the DOM: toggles the `dark` class on <html> whenever
 * the theme changes. Call this once near the app root.
 *
 * Returns the current theme and mutators so components (e.g. a toggle button)
 * can read/change it without touching the store directly.
 */
export function useTheme(): UseThemeResult {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  }, [theme]);

  return { theme, setTheme, toggleTheme };
}
