import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  resetLobbyToWaiting,
  subscribeToLobby,
} from '@/services/firebase/lobbyService';
import {
  advanceRound,
  advanceSet,
  autoProcess,
  discardTile,
  drawFromDeck,
  GameActionError,
  layPairs,
  openMelds,
  playPendingBotTurns,
  processTile,
  resolveTurnTimeout,
  returnTake,
  subscribeToPresence,
  writePresence,
  subscribeToGame,
  subscribeToHand,
  takeFromDiscard,
} from '@/services/firebase/gameService';
import { classifyMeld, isPair, OPENING_MIN, PAIRS_MIN } from '@/game/melds';
import { effectiveOpenMin, effectivePairMin } from '@/game/katlama';
import {
  lowestScorer,
  PENALTY_WRONG_OPEN,
  PENALTY_WRONG_PROCESS,
} from '@/game/scoring';
import { recordMatchHistory } from '@/services/firebase/historyService';
import { teamLabels } from '@/constants/lobby';
import { useAuthStore } from '@/store/authStore';
import { GameTable } from '@/components/game/GameTable';
import { DevPanel } from '@/components/game/DevPanel';
import { PenaltyToasts } from '@/components/game/PenaltyToast';
import { Tile as TileView } from '@/components/game/Tile';
import { RotateDevicePrompt } from '@/components/game/RotateDevicePrompt';
import type { Lobby } from '@/types/lobby';
import type { GameState, PenaltyEntry } from '@/types/game';
import type { Tile } from '@/game/tiles';
import type { Timestamp } from 'firebase/firestore';

/** Heartbeat cadence and the staleness past which a player counts as offline. */
const HEARTBEAT_MS = 8000;
const OFFLINE_MS = 20000;
/** Extra wait past the turn deadline before a driver fires for an offline player. */
const OFFLINE_FIRE_GRACE = 3000;
/** Turn length for a player who was ALREADY offline when their turn began. */
const ABSENT_TURN_SECONDS = 15;
/** Bots auto-play via their own loop; only humans are subject to presence. */
const isHuman = (u: string | undefined): u is string =>
  !!u && !u.startsWith('bot');

/**
 * How long the current turn lasts, in ms. A player who drops mid-turn still
 * gets the FULL clock for that turn; if they haven't come back by the time the
 * next one starts, their turns shorten to `ABSENT_TURN_SECONDS` so the table
 * isn't held up. Derived purely from presence + `turnStartedAt` — every client
 * computes the same value, so no extra state (and no race) in the game doc.
 */
function turnDurationMs(
  currentUid: string | undefined,
  turnStartedMs: number | null,
  presence: Record<string, Timestamp>,
  durationSeconds: number,
): number {
  if (!isHuman(currentUid) || turnStartedMs == null) {
    return durationSeconds * 1000;
  }
  const seen = presence[currentUid]?.toMillis?.() ?? null;
  // Heartbeat was already stale when this turn began -> they sat out the
  // previous one too. (A missing stamp means "unknown", not "absent".)
  const absentAtTurnStart = seen != null && turnStartedMs - seen > OFFLINE_MS;
  return absentAtTurnStart
    ? Math.min(durationSeconds, ABSENT_TURN_SECONDS) * 1000
    : durationSeconds * 1000;
}

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
  const [presence, setPresence] = useState<Record<string, Timestamp>>({});
  // Re-renders on a slow tick so time-based offline status refreshes without new data.
  const [nowTick, setNowTick] = useState(() => Date.now());

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

  // Presence: stamp my heartbeat on a timer, and subscribe to everyone's. The
  // heartbeat lives in a side doc, so it doesn't churn the main game snapshot.
  useEffect(() => {
    if (!id || !uid) return;
    const beat = () => void writePresence(id, uid).catch(() => {});
    beat();
    const iv = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [id, uid]);

  useEffect(() => {
    if (!id) return;
    return subscribeToPresence(id, setPresence);
  }, [id]);

  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 3000);
    return () => clearInterval(iv);
  }, []);

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

  // Live penalty announcements. penaltyLog only ever grows within a round and is
  // cleared when the next one deals, so anything past what we've already shown is
  // new. On first sight of a game — and after that reset — we sync silently so
  // old penalties don't replay. Entries are copied into state rather than read
  // back from the log, so a toast survives the round reset that clears it.
  const [penaltyToasts, setPenaltyToasts] = useState<
    { id: string; entry: PenaltyEntry }[]
  >([]);
  const announcedRef = useRef<number | null>(null);
  const toastSeqRef = useRef(0);
  useEffect(() => {
    if (!game) return;
    const log = game.penaltyLog ?? [];
    const announced = announcedRef.current;
    announcedRef.current = log.length;
    if (announced == null || log.length <= announced) return;
    const fresh = log.slice(announced).map((entry) => ({
      id: String(toastSeqRef.current++),
      entry,
    }));
    setPenaltyToasts((prev) => [...prev, ...fresh]);
  }, [game]);

  // Turn timeout. On expiry the turn is auto-resolved (draw + discard the drawn
  // tile). Two cases: (a) MY own turn — I fire it; (b) it's a DISCONNECTED
  // player's turn and I'm the designated driver — I fire it for them after a
  // small grace. The driver is the first ONLINE human in seat order, so exactly
  // one client fires (no herd); resolveTurnTimeout is race-safe as a backstop.
  const timeoutFiringRef = useRef(false);
  useEffect(() => {
    if (!id || !uid || !game || !lobby) return;
    if (game.status !== 'playing' || game.roundResult) return;
    const startedMs = game.turnStartedAt?.toMillis?.() ?? null;
    if (startedMs == null) return;
    const current = game.playerOrder[game.turnIndex];
    const duration = turnDurationMs(
      current,
      startedMs,
      presence,
      lobby.settings.turnDuration ?? 30,
    );
    const now = Date.now();
    const isOffline = (u: string): boolean => {
      if (!isHuman(u)) return false;
      const seen = presence[u]?.toMillis?.() ?? null;
      return seen != null && now - seen > OFFLINE_MS;
    };

    let target: string | null = null;
    let extraGrace = 0;
    if (current === uid) {
      target = uid;
    } else if (isOffline(current)) {
      const driver =
        game.playerOrder.find(
          (p) => p !== current && isHuman(p) && !isOffline(p),
        ) ?? null;
      if (driver === uid) {
        target = current;
        extraGrace = OFFLINE_FIRE_GRACE;
      }
    }
    if (!target) return;

    const fireFor = target;
    const fire = () => {
      if (timeoutFiringRef.current) return;
      timeoutFiringRef.current = true;
      resolveTurnTimeout(id, fireFor)
        .catch((err) => console.error('turn timeout resolve failed:', err))
        .finally(() => {
          timeoutFiringRef.current = false;
        });
    };
    const remaining = startedMs + duration + extraGrace - now;
    if (remaining <= 0) {
      fire();
      return;
    }
    const timer = setTimeout(fire, remaining);
    return () => clearTimeout(timer);
  }, [id, uid, game, lobby, presence, nowTick]);

  // When the whole MATCH ends, the host returns the lobby to waiting so it's
  // reusable and everyone can leave cleanly. (Between rounds the lobby stays in
  // progress — the host starts the next round from the scoreboard.)
  const resetDoneRef = useRef(false);
  useEffect(() => {
    if (!id || !game || !lobby) return;
    const matchComplete = game.roundResult?.matchComplete === true;
    if (matchComplete && uid === lobby.hostId && !resetDoneRef.current) {
      resetDoneRef.current = true;
      resetLobbyToWaiting(id).catch((err) =>
        console.error('resetLobbyToWaiting failed:', err),
      );
    }
  }, [id, game, lobby, uid]);

  // Record the finished match into MY own history — only for registered (non-
  // anonymous) players. Each player writes their own record; the doc id is the
  // match's stable createdAt, so it's idempotent across reloads.
  const historyDoneRef = useRef(false);
  useEffect(() => {
    if (!game || !lobby || !user || user.isAnonymous) return;
    if (game.roundResult?.matchComplete !== true || historyDoneRef.current) {
      return;
    }
    historyDoneRef.current = true;
    recordMatchHistory(user.uid, lobby, game).catch((err) =>
      console.error('recordMatchHistory failed:', err),
    );
  }, [game, lobby, user]);

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
  // Turn countdown: deadline = turn start + the effective turn duration (which
  // shortens for a player who was already offline when the turn began). The
  // clock only runs during a live turn (playing, no round-end modal).
  // turnStartedAt is briefly absent while the server timestamp resolves.
  const turnStartedMs = game.turnStartedAt?.toMillis?.() ?? null;
  const turnDeadlineMs =
    isPlaying && !game.roundResult && turnStartedMs != null
      ? turnStartedMs +
        turnDurationMs(
          currentTurnUid,
          turnStartedMs,
          presence,
          lobby.settings.turnDuration ?? 30,
        )
      : null;
  // Players whose heartbeat has gone stale (humans only) — shown as "bağlantısı
  // koptu" and auto-played by the driver. `nowTick` keeps this fresh over time.
  const offlineUids = new Set(
    game.playerOrder.filter((p) => {
      if (!isHuman(p)) return false;
      const seen = presence[p]?.toMillis?.() ?? null;
      return seen != null && nowTick - seen > OFFLINE_MS;
    }),
  );
  const isDrawPhase = isMyTurn && game.turnPhase === 'draw';
  const canDraw = isDrawPhase && game.drawCount > 0;
  const canTake = isDrawPhase;
  // A tentatively-taken left tile must be opened or returned before discarding.
  const hasPendingTake = !!game.pendingTake && game.pendingTake.uid === uid;
  const canDiscard =
    isMyTurn && game.turnPhase === 'discard' && !hasPendingTake;
  const tableMelds = game.melds ?? [];
  const hasOpened = uid != null && (game.opened ?? {})[uid] === true;
  // Assisted (destekli) blocks invalid moves; unassisted (desteksiz) lets them
  // through as a rejected-but-penalized move (when floor penalties are on).
  const assisted = game.assisted ?? lobby.settings.assisted ?? true;
  const myOpenType =
    uid != null ? ((game.openedWith ?? {})[uid] ?? null) : null;
  const pairsAreaExists = tableMelds.some((meld) => meld.kind === 'pair');

  // Match/round progression. A set is roundsPerSet rounds; bestOf sets make the
  // match. The round-end writes setComplete/matchComplete onto roundResult.
  const roundsPerSet = game.roundsPerSet ?? lobby.settings.matchFormat.roundsPerSet;
  const roundsPlayed = game.roundsPlayed ?? 0;
  const bestOf = game.bestOf ?? lobby.settings.matchFormat.bestOf;
  const setIndex = game.setIndex ?? 0;
  const isSeries = bestOf > 1;
  const setComplete = game.roundResult?.setComplete === true;
  const matchOver = game.roundResult?.matchComplete === true;
  const paired = !!game.teams;
  const isHost = uid === lobby.hostId;
  const nameFor = (playerUid: string | undefined) =>
    lobby.players.find((p) => p.uid === playerUid)?.displayName ?? 'Oyuncu';
  // A "side" is a player uid in solo, or a team key ('0'|'1') in paired mode.
  const sideName = (side: string | undefined) =>
    side == null
      ? 'Oyuncu'
      : paired && (side === '0' || side === '1')
        ? teamLabels[Number(side) as 0 | 1]
        : nameFor(side);
  // You can lay melds on any of your discard-phase turns: the first lay must
  // reach 101 (handled below), later ones may add any valid melds.
  const canOpen = isMyTurn && game.turnPhase === 'discard';
  // İşleme requires you to have opened first.
  const canProcess = canOpen && hasOpened;
  // Effective FIRST-open targets (rise above opponents' openings under katlama).
  const meldTarget = uid ? effectiveOpenMin(game, uid) : OPENING_MIN;
  const pairTarget = uid ? effectivePairMin(game, uid) : PAIRS_MIN;

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

    if (!assisted) {
      // Unassisted: the open area IS your declaration. Send the attempted melds
      // (groups of 2+ tiles) raw; the server opens them if valid, otherwise it
      // rejects the open and writes a wrong-open penalty.
      const attempted = groups.filter((tiles) => tiles.length >= 2);
      if (attempted.length === 0) {
        setOpenError('Açmak için açık alana per yerleştir.');
        return;
      }
      try {
        await openMelds(id, uid, attempted);
      } catch (err) {
        if (err instanceof GameActionError && err.code === 'wrong-open') {
          setOpenError(`Yanlış açma — ${PENALTY_WRONG_OPEN} ceza yazıldı.`);
        } else {
          console.error('openMelds failed:', err);
          setOpenError('Açma başarısız oldu.');
        }
      }
      return;
    }

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
    if (!alreadyOpened && total < meldTarget) {
      setOpenError(
        `Geçerli perlerin toplamı ${total} — açmak için en az ${meldTarget} gerekli.`,
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

  async function handleLayPairs(groups: Tile[][]) {
    if (!id || !uid || !game) return;
    setOpenError(null);

    if (!assisted) {
      // Unassisted: send the attempted pairs (2-tile groups) raw; server lays
      // them if valid, otherwise rejects + writes a wrong-open penalty.
      const attempted = groups.filter((tiles) => tiles.length >= 2);
      if (attempted.length === 0) {
        setOpenError('Çift koymak için açık alana taş yerleştir.');
        return;
      }
      try {
        await layPairs(id, uid, attempted);
      } catch (err) {
        if (err instanceof GameActionError && err.code === 'wrong-open') {
          setOpenError(`Yanlış açma — ${PENALTY_WRONG_OPEN} ceza yazıldı.`);
        } else {
          console.error('layPairs failed:', err);
          setOpenError('Çift koymak başarısız oldu.');
        }
      }
      return;
    }

    // Only contiguous valid pairs count; leave a gap between each pair.
    const pairGroups = groups.filter((tiles) =>
      isPair(
        tiles.map((tile) => tile.face),
        game.okey,
      ),
    );

    if (pairGroups.length === 0) {
      setOpenError('Geçerli çift oluştur (aralarına boşluk bırak).');
      return;
    }

    const alreadyOpened = (game.opened ?? {})[uid] === true;
    if (!alreadyOpened && pairGroups.length < pairTarget) {
      setOpenError(
        `${pairGroups.length} çift — açmak için en az ${pairTarget} çift gerekli.`,
      );
      return;
    }

    try {
      await layPairs(id, uid, pairGroups);
    } catch (err) {
      console.error('layPairs failed:', err);
      setOpenError('Çift koymak başarısız oldu.');
    }
  }

  async function handleProcess(meldId: string, tileId: string) {
    if (!id || !uid) return;
    setOpenError(null);
    try {
      await processTile(id, uid, meldId, tileId);
    } catch (err) {
      if (err instanceof GameActionError && err.code === 'wrong-process') {
        // Unassisted: the move was rejected but a penalty was written.
        setOpenError(`Yanlış işleme — ${PENALTY_WRONG_PROCESS} ceza yazıldı.`);
      } else {
        console.error('processTile failed:', err);
        setOpenError('Bu taş bu pere işlenemez.');
      }
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

  async function handleNextRound() {
    if (!id) return;
    try {
      await advanceRound(id);
    } catch (err) {
      console.error('advanceRound failed:', err);
    }
  }

  async function handleNextSet() {
    if (!id) return;
    try {
      await advanceSet(id);
    } catch (err) {
      console.error('advanceSet failed:', err);
    }
  }

  async function handleReturnTake() {
    if (!id || !uid) return;
    try {
      await returnTake(id, uid);
    } catch (err) {
      console.error('returnTake failed:', err);
    }
  }

  return (
    <>
      <PenaltyToasts
        items={penaltyToasts.map((toast) => ({
          id: toast.id,
          entry: toast.entry,
          name: nameFor(toast.entry.uid),
          label: penaltyReasonLabels[toast.entry.reason] ?? 'ceza',
        }))}
        onExpire={(expiredId) =>
          setPenaltyToasts((prev) =>
            prev.filter((toast) => toast.id !== expiredId),
          )
        }
      />
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
        myOpenType={myOpenType}
        pairsAreaExists={pairsAreaExists}
        hasPendingTake={hasPendingTake}
        {...(hasPendingTake && game.pendingTake
          ? { pendingTileId: game.pendingTake.tile.id }
          : {})}
        melds={tableMelds}
        canProcess={canProcess}
        assisted={lobby.settings.assisted ?? true}
        meldTarget={meldTarget}
        pairTarget={pairTarget}
        turnDeadlineMs={turnDeadlineMs}
        offlineUids={offlineUids}
        onDraw={handleDraw}
        onTakeDiscard={handleTakeDiscard}
        onDiscard={handleDiscard}
        onOpen={handleOpen}
        onLayPairs={handleLayPairs}
        onReturnTake={handleReturnTake}
        onProcess={handleProcess}
        onAutoProcess={handleAutoProcess}
      />
      <RotateDevicePrompt />

      {uid && <DevPanel lobbyId={lobby.id} uid={uid} />}

      {openError && (
        <div className="fixed left-1/2 top-12 z-40 -translate-x-1/2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {openError}
        </div>
      )}

      {game.status === 'finished' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-stone-100/15 bg-felt-900 p-5 text-stone-100 shadow-2xl">
            <h2 className="text-center text-lg font-semibold">
              {matchOver ? 'Maç bitti' : setComplete ? 'Set bitti' : 'El bitti'}
            </h2>
            <p className="mt-1 text-center text-sm text-stone-300">
              {game.roundResult?.reason === 'finish'
                ? `${nameFor(game.roundResult.winner)} eli kapattı${
                    game.roundResult.doubled ? ' · ×2' : ''
                  }`
                : 'Deste tükendi'}
            </p>
            {isSeries && (
              <p className="mt-0.5 text-center text-xs text-stone-400">
                Set {Math.min(setIndex + 1, bestOf)}/{bestOf}
              </p>
            )}

            {/* Set wins tally (only meaningful in a series). */}
            {isSeries && (
              <div className="mt-3 flex justify-center gap-4 text-sm">
                {(paired ? ['0', '1'] : game.playerOrder).map((side) => (
                  <span key={side} className="text-stone-200">
                    {sideName(side)}:{' '}
                    <span className="font-semibold text-amber-300">
                      {game.setsWon?.[side] ?? 0}
                    </span>
                  </span>
                ))}
              </div>
            )}

            <ScoreTable game={game} meUid={uid} nameFor={nameFor} />

            {/* Floor penalties (red, positive) and rewards like rekor (green,
                negative) applied this round — already folded into Bu el. */}
            {(() => {
              const entries = game.roundResult?.penalties ?? [];
              const cezalar = entries.filter((p) => p.points > 0);
              const oduller = entries.filter((p) => p.points < 0);
              return (
                <>
                  {cezalar.length > 0 && (
                    <div className="mt-3 space-y-1 rounded-md bg-red-950/40 px-2 py-1.5">
                      <p className="text-[11px] uppercase tracking-wide text-red-300/80">
                        Ceza
                      </p>
                      {cezalar.map((p, index) => (
                        <div
                          key={`${p.uid}-${index}`}
                          className="flex items-center justify-between gap-2 text-sm text-red-200"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">
                              {nameFor(p.uid)} ·{' '}
                              {penaltyReasonLabels[p.reason] ?? 'ceza'}
                            </span>
                            {p.tile && <TileView tile={p.tile} size="sm" />}
                          </span>
                          <span className="tabular-nums font-semibold">
                            +{p.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {oduller.length > 0 && (
                    <div className="mt-3 space-y-1 rounded-md bg-emerald-950/40 px-2 py-1.5">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-300/80">
                        Ödül
                      </p>
                      {oduller.map((p, index) => (
                        <div
                          key={`${p.uid}-${index}`}
                          className="flex items-center justify-between gap-2 text-sm text-emerald-200"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">
                              {nameFor(p.uid)} ·{' '}
                              {penaltyReasonLabels[p.reason] ?? 'ödül'}
                            </span>
                            {p.tile && <TileView tile={p.tile} size="sm" />}
                          </span>
                          <span className="tabular-nums font-semibold">
                            {p.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Who won the set, when a set just ended mid-match. */}
            {setComplete && !matchOver && (
              <p className="mt-4 text-center text-sm">
                Seti kazanan:{' '}
                <span className="font-semibold text-amber-300">
                  {sideName(
                    game.roundResult?.setWinner ??
                      lowestScorer(game.playerOrder, game.scores ?? {}),
                  )}
                </span>
              </p>
            )}

            {matchOver ? (
              <>
                <p className="mt-4 text-center text-sm">
                  {isSeries ? 'Maçı kazanan' : 'Kazanan'}:{' '}
                  <span className="font-semibold text-amber-300">
                    {sideName(
                      game.roundResult?.matchWinner ??
                        game.roundResult?.setWinner ??
                        lowestScorer(game.playerOrder, game.scores ?? {}),
                    )}
                  </span>
                </p>
                <Link
                  to={`/lobby/${lobby.id}`}
                  className="mt-3 block rounded-md bg-zinc-100 px-4 py-2 text-center text-sm font-semibold text-zinc-900 hover:bg-white"
                >
                  Lobiye dön
                </Link>
              </>
            ) : isHost ? (
              <button
                type="button"
                onClick={setComplete ? handleNextSet : handleNextRound}
                className="mt-4 w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-400"
              >
                {setComplete
                  ? 'Sonraki set'
                  : `Sonraki tur (${roundsPlayed}/${roundsPerSet})`}
              </button>
            ) : (
              <p className="mt-4 text-center text-sm text-stone-400">
                {setComplete
                  ? 'Sonraki seti kurucu başlatacak…'
                  : 'Sonraki turu kurucu başlatacak…'}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Turkish reason labels for floor penalties shown on the scoreboard. */
const penaltyReasonLabels: Record<string, string> = {
  'take-open-series': 'attığı taşla açıldı (seri)',
  'take-open-pair': 'attığı taşla açıldı (çift)',
  'discard-okey': 'okeyle attı',
  'discard-processable': 'işlek taş attı',
  'held-okey': 'elinde okey kaldı',
  'wrong-open': 'yanlış açma',
  'wrong-process': 'yanlış işleme',
  rekor: 'rekor açış',
};

/** Formats a round delta with an explicit sign (penalties are positive). */
function fmtDelta(delta: number | undefined): string {
  if (delta == null) return '–';
  return delta > 0 ? `+${delta}` : String(delta);
}

/**
 * Between-rounds score table. Solo mode is a flat per-player list sorted by set
 * total; paired mode groups the two teams (combined total + member rows), with
 * the leading team on top.
 */
function ScoreTable({
  game,
  meUid,
  nameFor,
}: {
  game: GameState;
  meUid: string | undefined;
  nameFor: (uid: string | undefined) => string;
}) {
  const deltaOf = (uid: string) => game.roundResult?.delta[uid];
  const totalOf = (uid: string) => game.scores?.[uid] ?? 0;
  // Penalties (and the negative rekor reward) charged to this player this round.
  const penaltyOf = (uid: string) =>
    (game.roundResult?.penalties ?? []).reduce(
      (sum, entry) => (entry.uid === uid ? sum + entry.points : sum),
      0,
    );
  // "Elde kalan": the hand-only part of the round. Rounds scored before
  // handDelta existed fall back to deriving it from the total.
  const handOf = (uid: string) => {
    const total = deltaOf(uid);
    if (total == null) return undefined;
    return game.roundResult?.handDelta?.[uid] ?? total - penaltyOf(uid);
  };

  const header = (
    <div className="flex items-center justify-between gap-2 px-2 text-[11px] uppercase tracking-wide text-stone-400">
      <span className="truncate">{game.teams ? 'Takım' : 'Oyuncu'}</span>
      <span className="flex shrink-0 gap-2">
        <span className="w-12 text-right">Elde</span>
        <span className="w-12 text-right">Ceza</span>
        <span className="w-12 text-right">Bu el</span>
        <span className="w-12 text-right">Toplam</span>
      </span>
    </div>
  );

  /** Penalty cell: silent at zero, red when charged, green for a reward. */
  const penaltyCell = (points: number) => (
    <span
      className={`w-12 text-right ${
        points > 0
          ? 'text-red-300'
          : points < 0
            ? 'text-emerald-300'
            : 'text-stone-500'
      }`}
    >
      {points === 0 ? '–' : fmtDelta(points)}
    </span>
  );

  const playerRow = (uid: string, indent = false) => (
    <div
      key={uid}
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${
        uid === meUid ? 'bg-white/10' : ''
      } ${indent ? 'pl-4 text-stone-300' : ''}`}
    >
      <span className="truncate">{nameFor(uid)}</span>
      <span className="flex shrink-0 gap-2 tabular-nums">
        <span className="w-12 text-right text-stone-400">
          {fmtDelta(handOf(uid))}
        </span>
        {penaltyCell(penaltyOf(uid))}
        <span className="w-12 text-right text-stone-300">
          {fmtDelta(deltaOf(uid))}
        </span>
        <span className="w-12 text-right font-semibold">{totalOf(uid)}</span>
      </span>
    </div>
  );

  // Solo: flat list, lowest total first.
  if (!game.teams) {
    const order = [...game.playerOrder].sort(
      (a, b) => totalOf(a) - totalOf(b),
    );
    return (
      <div className="mt-4 space-y-1">
        {header}
        {order.map((uid) => playerRow(uid))}
      </div>
    );
  }

  // Paired: two team blocks, leading (lowest combined) team on top.
  const teams = game.teams;
  const teamData = ([0, 1] as const)
    .map((team) => {
      const members = game.playerOrder.filter((uid) => teams[uid] === team);
      const teamTotal = members.reduce((sum, uid) => sum + totalOf(uid), 0);
      const deltas = members.map((uid) => deltaOf(uid));
      const scored = !deltas.some((d) => d == null);
      const teamDelta = scored
        ? deltas.reduce<number>((sum, d) => sum + (d ?? 0), 0)
        : undefined;
      const teamHand = scored
        ? members.reduce((sum, uid) => sum + (handOf(uid) ?? 0), 0)
        : undefined;
      const teamPenalty = members.reduce(
        (sum, uid) => sum + penaltyOf(uid),
        0,
      );
      return { team, members, teamTotal, teamDelta, teamHand, teamPenalty };
    })
    .sort((a, b) => a.teamTotal - b.teamTotal);

  return (
    <div className="mt-4 space-y-3">
      {header}
      {teamData.map(
        ({ team, members, teamTotal, teamDelta, teamHand, teamPenalty }) => (
        <div key={team} className="space-y-1">
          <div className="flex items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1.5 text-sm">
            <span className="truncate font-semibold">{teamLabels[team]}</span>
            <span className="flex shrink-0 gap-2 tabular-nums">
              <span className="w-12 text-right text-stone-400">
                {fmtDelta(teamHand)}
              </span>
              {penaltyCell(teamPenalty)}
              <span className="w-12 text-right text-stone-300">
                {fmtDelta(teamDelta)}
              </span>
              <span className="w-12 text-right font-semibold text-amber-300">
                {teamTotal}
              </span>
            </span>
          </div>
          {members.map((uid) => playerRow(uid, true))}
        </div>
        ),
      )}
    </div>
  );
}
