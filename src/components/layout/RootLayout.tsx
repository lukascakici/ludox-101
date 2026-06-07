import { Link, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { AuthScreen } from '@/components/auth/AuthScreen';

/**
 * App shell: a persistent header plus the routed page content. Also acts as the
 * auth gate — until a user is signed in, every route shows the auth screen.
 */
export function RootLayout() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 transition-colors dark:bg-felt-950 dark:text-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-felt-800">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Ludox
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user && <UserMenu user={user} />}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-12">
        {status === 'loading' && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            Yükleniyor…
          </p>
        )}

        {status === 'unauthenticated' && <AuthScreen />}

        {status === 'authenticated' && <Outlet />}
      </main>
    </div>
  );
}
