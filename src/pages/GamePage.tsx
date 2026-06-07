import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { subscribeToLobby } from '@/services/firebase/lobbyService';
import { useAuthStore } from '@/store/authStore';
import { GameTable } from '@/components/game/GameTable';
import { RotateDevicePrompt } from '@/components/game/RotateDevicePrompt';
import type { Lobby } from '@/types/lobby';

type LoadState = 'loading' | 'ready' | 'notfound' | 'error';

/** Full-screen game route. Rendered outside the app chrome (no header). */
export function GamePage() {
  const { id } = useParams<{ id: string }>();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!id) return;
    setState('loading');
    const unsubscribe = subscribeToLobby(
      id,
      (result) => {
        if (result) {
          setLobby(result);
          setState('ready');
        } else {
          setState('notfound');
        }
      },
      (err) => {
        console.error('subscribeToLobby failed:', err);
        setState('error');
      },
    );
    return unsubscribe;
  }, [id]);

  // The game route lives outside the auth gate; guard it here.
  if (status === 'unauthenticated') return <Navigate to="/" replace />;

  if (state === 'loading' || status === 'loading') {
    return (
      <div className="flex h-dvh items-center justify-center bg-felt-950 text-sm text-stone-300">
        Yükleniyor…
      </div>
    );
  }

  if (state === 'notfound' || !lobby) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-felt-950 text-stone-200">
        <p className="text-sm">Lobi bulunamadı.</p>
        <Link to="/" className="text-sm underline">
          Ana sayfaya dön
        </Link>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-felt-950 text-stone-200">
        <p className="text-sm">Oyun yüklenirken bir hata oluştu.</p>
        <Link to="/" className="text-sm underline">
          Ana sayfaya dön
        </Link>
      </div>
    );
  }

  return (
    <>
      <GameTable lobby={lobby} currentUid={user?.uid} />
      <RotateDevicePrompt />
    </>
  );
}
