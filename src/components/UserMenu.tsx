import type { User } from 'firebase/auth';
import { signOut } from '@/services/firebase/authService';

/** Header widget: shows the signed-in user and a sign-out button. */
export function UserMenu({ user }: { user: User }) {
  const name = user.displayName?.trim() || 'Oyuncu';

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-100">
          {name}
        </span>
        {user.isAnonymous && (
          <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-500 dark:border-felt-700 dark:text-zinc-400">
            Misafir
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-felt-700 dark:bg-felt-900 dark:text-zinc-200 dark:hover:bg-felt-800"
      >
        Çıkış
      </button>
    </div>
  );
}
