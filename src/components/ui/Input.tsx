import type { InputHTMLAttributes } from 'react';

const baseClasses =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-50 dark:border-felt-800 dark:bg-felt-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-felt-700';

/** Shared text input, themed for both light (zinc) and dark (felt) modes. */
export function Input({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${baseClasses} ${className}`} {...rest} />;
}
