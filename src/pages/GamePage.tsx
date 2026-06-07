import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  resetLobbyToWaiting,
  subscribeToLobby,
} from '@/services/firebase/lobbyService';
import {
  autoProcess,
  discardTile,
  drawFromDeck,
  openMelds,
  playPendingBotTurns,
  processTile,
  subscribeToGame,
  subscribeToHand,
  takeFromDiscard,
} from '@/services/firebase/gameService';
import { classifyMeld, OPENING_MIN } from '@/game/melds';
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
  const [openError, setOpenError] = useState<string | null>(null);

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

  // Dev: auto-play bot turns. A game-change trigger keeps it responsive, and a
  // polling safety net re-kicks it if a bot ever gets stuck.
  const botPlayingRef = useRef(false);
  const gameRef = useRef<GameState | null>(game);
  gameRef.current = game;

  function maybePlayBots() {
    if (!import.meta.env.DEV || !id || botPlayingRef.current) return;
    const current = gameRef.current;
    if (!current || current.status !== 'playing') return;
    if (!current.playerOrder[current.turnIndex]?.startsWith('bot')) return;
    botPlayingRef.current = true;
    playPendingBotTurns(id)
      .catch((err) => console.error('bot auto-play failed:', err))
      .finally(() => {
        botPlayingRef.current = false;
      });
  }

  useEffect(() => {
    maybePlayBots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, game]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const interval = setInterval(maybePlayBots, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-dismiss the open/process error toast.
  useEffect(() => {
    if (!openError) return;
    const timer = setTimeout(() => setOpenError(null), 3000);
    return () => clearTimeout(timer);
  }, [openError]);

  // When the hand ends, the host returns the lobby to waiting so it's reusable
  // and everyone can leave cleanly.
  const resetDoneRef = useRef(false);
  useEffect(() => {
    if (!id || !game || !lobby) return;
    if (
      game.status === 'finished' &&
      uid === lobby.hostId &&
      !resetDoneRef.current
    ) {
      resetDoneRef.current = true;
      resetLobbyToWaiting(id).catch((err) =>
        console.error('resetLobbyToWaiting failed:', err),
      );
    }
  }, [id, game, lobby, uid]);

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
  const isPlaying = game.status === 'playing';
  const isMyTurn = isPlaying && !!uid && uid === currentTurnUid;
  const isDrawPhase = isMyTurn && game.turnPhase === 'draw';
  const canDraw = isDrawPhase && game.drawCount > 0;
  const canTake = isDrawPhase;
  const canDiscard = isMyTurn && game.turnPhase === 'discard';
  const tableMelds = game.melds ?? [];
  const hasOpened = uid != null && (game.opened ?? {})[uid] === true;
  // You can lay melds on any of your discard-phase turns: the first lay must
  // reach 101 (handled below), later ones may add any valid melds.
  const canOpen = isMyTurn && game.turnPhase === 'discard';
  // İşleme requires you to have opened first.
  const canProcess = canOpen && hasOpened;

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

  async function handleOpen(groups: Tile[][]) {
    if (!id || !uid || !game) return;
    setOpenError(null);

    // Only contiguous groups that are VALID melds count; everything else stays
    // in hand. You don't need to meld all your tiles — just reach 101 with melds.
    const validMelds = groups
      .map((tiles) => ({
        tiles,
        info: classifyMeld(
          tiles.map((tile) => tile.face),
          game.okey,
        ),
      }))
      .filter((entry) => entry.info !== null);

    if (validMelds.length === 0) {
      setOpenError('Geçerli bir per oluştur (aralarına boşluk bırak).');
      return;
    }

    const total = validMelds.reduce(
      (sum, entry) => sum + (entry.info?.value ?? 0),
      0,
    );
    const alreadyOpened = (game.opened ?? {})[uid] === true;
    if (!alreadyOpened && total < OPENING_MIN) {
      setOpenError(
        `Geçerli perlerin toplamı ${total} — açmak için en az ${OPENING_MIN} gerekli.`,
      );
      return;
    }

    try {
      await openMelds(
        id,
        uid,
        validMelds.map((entry) => entry.tiles),
      );
    } catch (err) {
      console.error('openMelds failed:', err);
      setOpenError('Açma başarısız oldu.');
    }
  }

  async function handleProcess(meldId: string, tileId: string) {
    if (!id || !uid) return;
    setOpenError(null);
    try {
      await processTile(id, uid, meldId, tileId);
    } catch (err) {
      console.error('processTile failed:', err);
      setOpenError('Bu taş bu pere işlenemez.');
    }
  }

  async function handleAutoProcess() {
    if (!id || !uid) return;
    try {
      await autoProcess(id, uid);
    } catch (err) {
      console.error('autoProcess failed:', err);
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
        canOpen={canOpen}
        hasOpened={hasOpened}
        melds={tableMelds}
        canProcess={canProcess}
        assisted={lobby.settings.assisted ?? true}
        onDraw={handleDraw}
        onTakeDiscard={handleTakeDiscard}
        onDiscard={handleDiscard}
        onOpen={handleOpen}
        onProcess={handleProcess}
        onAutoProcess={handleAutoProcess}
      />
      <RotateDevicePrompt />

      {openError && (
        <div className="fixed left-1/2 top-12 z-40 -translate-x-1/2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {openError}
        </div>
      )}

      {game.status === 'finished' && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/60 text-stone-100">
          <p className="text-lg font-semibold">Oyun bitti</p>
          <p className="text-sm text-stone-300">
            {game.winner
              ? `${
                  lobby.players.find((p) => p.uid === game.winner)?.displayName ??
                  'Bir oyuncu'
                } kazandı!`
              : 'Deste tükendi.'}
          </p>
          <Link
            to={`/lobby/${lobby.id}`}
            className="mt-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white"
          >
            Lobiye dön
          </Link>
        </div>
      )}
    </>
  );
}
