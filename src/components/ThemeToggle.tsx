import { useTheme } from '@/hooks/useTheme';

/**
 * Minimal theme switcher. Text-only (no icons/emoji), no animation — switches
 * between light and dark. Label is the theme it will switch TO.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === 'dark' ? 'Açık tema' : 'Koyu tema';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`${nextLabel}ya geç`}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-felt-700 dark:bg-felt-900 dark:text-zinc-200 dark:hover:bg-felt-800"
    >
      {nextLabel}
    </button>
  );
}
