import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { subscribeToLobby } from '@/services/firebase/lobbyService';
import {
  discardTile,
  drawFromDeck,
  playPendingBotTurns,
  subscribeToGame,
  subscribeToHand,
  takeFromDiscard,
} from '@/services/firebase/gameService';
import { useAuthStore } from '@/store/authStore';
import { GameTable } from '@/components/game/GameTable';
import { RotateDevicePrompt } from '@/components/game/RotateDevicePrompt';
import type { Lobby } from '@/types/lobby';
import type { GameState } from '@/types/game';
import type { Tile } from '@/game/tiles';

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-felt-950 text-stone-200">
      {children}
    </div>
  );
}

/** Full-screen game route. Rendered outside the app chrome (no header). */
export function GamePage() {
  const { id } = useParams<{ id: string }>();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid;

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [lobbyLoaded, setLobbyLoaded] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [gameLoaded, setGameLoaded] = useState(false);
  const [hand, setHand] = useState<Tile[] | null>(null);

  useEffect(() => {
    if (!id) return;
    return subscribeToLobby(id, (result) => {
      setLobby(result);
      setLobbyLoaded(true);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return subscribeToGame(
      id,
      (result) => {
        setGame(result);
        setGameLoaded(true);
      },
      (err) => {
        console.error('subscribeToGame failed:', err);
        setGameLoaded(true);
      },
    );
  }, [id]);

  useEffect(() => {
    if (!id || !uid) return;
    return subscribeToHand(id, uid, setHand, (err) => {
      console.error('subscribeToHand failed:', err);
    });
  }, [id, uid]);

  // Dev: when it's a bot's turn, auto-play their moves (guarded against re-entry).
  const botPlayingRef = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !id || !game) return;
    const current = game.playerOrder[game.turnIndex];
    if (!current.startsWith('bot') || botPlayingRef.current) return;
    botPlayingRef.current = true;
    playPendingBotTurns(id)
      .catch((err) => console.error('bot auto-play failed:', err))
      .finally(() => {
        botPlayingRef.current = false;
      });
  }, [id, game]);

  if (status === 'unauthenticated') return <Navigate to="/" replace />;

  if (status === 'loading' || !lobbyLoaded || !gameLoaded) {
    return <FullScreenMessage>Yükleniyor…</FullScreenMessage>;
  }

  if (!lobby) {
    return (
      <FullScreenMessage>
        <p className="text-sm">Lobi bulunamadı.</p>
        <Link to="/" className="text-sm underline">
          Ana sayfaya dön
        </Link>
      </FullScreenMessage>
    );
  }

  if (!game) {
    return (
      <FullScreenMessage>
        <p className="text-sm">Oyun henüz başlamadı.</p>
        <Link to={`/lobby/${lobby.id}`} className="text-sm underline">
          Lobiye dön
        </Link>
      </FullScreenMessage>
    );
  }

  const currentTurnUid = game.playerOrder[game.turnIndex];
  const isMyTurn = !!uid && uid === currentTurnUid;
  const isDrawPhase = isMyTurn && game.turnPhase === 'draw';
  const canDraw = isDrawPhase && game.drawCount > 0;
  const canTake = isDrawPhase;
  const canDiscard = isMyTurn && game.turnPhase === 'discard';

  async function handleDraw() {
    if (!id || !uid) return;
    try {
      await drawFromDeck(id, uid);
    } catch (err) {
      console.error('drawFromDeck failed:', err);
    }
  }

  async function handleTakeDiscard() {
    if (!id || !uid) return;
    try {
      await takeFromDiscard(id, uid);
    } catch (err) {
      console.error('takeFromDiscard failed:', err);
    }
  }

  async function handleDiscard(tileId: string) {
    if (!id || !uid) return;
    try {
      await discardTile(id, uid, tileId);
    } catch (err) {
      console.error('discardTile failed:', err);
    }
  }

  return (
    <>
      <GameTable
        lobby={lobby}
        currentUid={uid}
        hand={hand ?? []}
        indicator={game.indicator}
        handCounts={game.handCounts}
        drawPileCount={game.drawCount}
        playerOrder={game.playerOrder}
        discards={game.discards}
        turnIndex={game.turnIndex}
        canDraw={canDraw}
        canTake={canTake}
        canDiscard={canDiscard}
        onDraw={handleDraw}
        onTakeDiscard={handleTakeDiscard}
        onDiscard={handleDiscard}
      />
      <RotateDevicePrompt />
    </>
  );
}
