export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible group label (visually hidden). */
  ariaLabel: string;
}

/**
 * Flat, Uber-like segmented selector. The active segment is filled; others are
 * plain. No gradients, no animation beyond a color transition. Works in both
 * light (zinc) and dark (felt) themes.
 *
 * Generic over the option value type so it can drive enums, numbers, etc.
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full rounded-md border border-zinc-300 bg-zinc-100 p-0.5 dark:border-felt-800 dark:bg-felt-900"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={[
              'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-40',
              isActive
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-felt-700 dark:text-white'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
