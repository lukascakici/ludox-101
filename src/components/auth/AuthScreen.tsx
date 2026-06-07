import { useState, type FormEvent } from 'react';
import {
  registerWithEmail,
  signInAsGuest,
  signInWithEmail,
} from '@/services/firebase/authService';
import { getAuthErrorMessage } from '@/constants/authErrors';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Input } from '@/components/ui/Input';

type AuthMode = 'guest' | 'signin' | 'signup';

/**
 * Authentication gate. Lets a user enter as a guest (anonymous + nickname),
 * sign in, or register with email/password. The auth listener updates the
 * store on success, which swaps this screen out for the app.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('guest');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsNickname = mode === 'guest' || mode === 'signup';
  const needsEmail = mode === 'signin' || mode === 'signup';

  const canSubmit =
    (!needsNickname || nickname.trim().length > 0) &&
    (!needsEmail || (email.trim().length > 0 && password.length > 0));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'guest') {
        await signInAsGuest(nickname);
      } else if (mode === 'signin') {
        await signInWithEmail(email.trim(), password);
      } else {
        await registerWithEmail(email.trim(), password, nickname);
      }
      // On success the auth listener takes over; no navigation needed here.
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel: Record<AuthMode, string> = {
    guest: 'Misafir olarak gir',
    signin: 'Giriş yap',
    signup: 'Kayıt ol',
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-felt-800 dark:bg-felt-900">
        <h1 className="text-xl font-semibold tracking-tight">Ludox’a hoş geldin</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Devam etmek için bir yöntem seç.
        </p>

        <div className="mt-5">
          <SegmentedControl
            ariaLabel="Giriş yöntemi"
            value={mode}
            onChange={(value) => {
              setMode(value);
              setError(null);
            }}
            options={[
              { value: 'guest', label: 'Misafir' },
              { value: 'signin', label: 'Giriş Yap' },
              { value: 'signup', label: 'Kayıt Ol' },
            ]}
          />
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {needsNickname && (
            <div className="space-y-2">
              <label
                htmlFor="nickname"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
              >
                Takma Ad
              </label>
              <Input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={24}
                placeholder="Örn. Okeyci42"
                autoComplete="nickname"
              />
            </div>
          )}

          {needsEmail && (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
                >
                  E-posta
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@eposta.com"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
                >
                  Şifre
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'En az 6 karakter' : 'Şifre'}
                  autoComplete={
                    mode === 'signup' ? 'new-password' : 'current-password'
                  }
                />
              </div>
            </>
          )}

          {error && (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {submitting ? 'Lütfen bekle…' : submitLabel[mode]}
          </button>
        </form>
      </div>

      <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Misafir girişinde oyun geçmişin tutulmaz. Kayıt olarak geçmişini
        saklayabilirsin.
      </p>
    </div>
  );
}
