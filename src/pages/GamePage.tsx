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
import { RotateDevicePrompt } from '@/components/game/RotateDevicePrompt';
import type { Lobby } from '@/types/lobby';
import type { GameState } from '@/types/game';
import type { Tile } from '@/game/tiles';
import type { Timestamp } from 'firebase/firestore';

/** Heartbeat cadence and the staleness past which a player counts as offline. */
const HEARTBEAT_MS = 8000;
const OFFLINE_MS = 20000;
/** Extra wait past the turn deadline before a driver fires for an offline player. */
const OFFLINE_FIRE_GRACE = 3000;
/** Bots auto-play via their own loop; only humans are subject to presence. */
const isHuman = (u: string | undefined): u is string =>
  !!u && !u.startsWith('bot');

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
    const duration = (lobby.settings.turnDuration ?? 30) * 1000;
    const current = game.playerOrder[game.turnIndex];
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
  // Turn countdown: deadline = turn start + the lobby's turn duration. The clock
  // only runs during a live turn (playing, no round-end modal). turnStartedAt is
  // briefly absent while the server timestamp resolves.
  const turnStartedMs = game.turnStartedAt?.toMillis?.() ?? null;
  const turnDeadlineMs =
    isPlaying && !game.roundResult && turnStartedMs != null
      ? turnStartedMs + (lobby.settings.turnDuration ?? 30) * 1000
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
                          className="flex items-center justify-between text-sm text-red-200"
                        >
                          <span className="truncate">
                            {nameFor(p.uid)} ·{' '}
                            {penaltyReasonLabels[p.reason] ?? 'ceza'}
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
                          className="flex items-center justify-between text-sm text-emerald-200"
                        >
                          <span className="truncate">
                            {nameFor(p.uid)} ·{' '}
                            {penaltyReasonLabels[p.reason] ?? 'ödül'}
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

  const header = (
    <div className="flex items-center justify-between px-2 text-[11px] uppercase tracking-wide text-stone-400">
      <span>{game.teams ? 'Takım' : 'Oyuncu'}</span>
      <span className="flex gap-3">
        <span className="w-12 text-right">Bu el</span>
        <span className="w-12 text-right">Toplam</span>
      </span>
    </div>
  );

  const playerRow = (uid: string, indent = false) => (
    <div
      key={uid}
      className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
        uid === meUid ? 'bg-white/10' : ''
      } ${indent ? 'pl-4 text-stone-300' : ''}`}
    >
      <span className="truncate">{nameFor(uid)}</span>
      <span className="flex gap-3 tabular-nums">
        <span className="w-12 text-right text-stone-400">
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
      const teamDelta = deltas.some((d) => d == null)
        ? undefined
        : deltas.reduce<number>((sum, d) => sum + (d ?? 0), 0);
      return { team, members, teamTotal, teamDelta };
    })
    .sort((a, b) => a.teamTotal - b.teamTotal);

  return (
    <div className="mt-4 space-y-3">
      {header}
      {teamData.map(({ team, members, teamTotal, teamDelta }) => (
        <div key={team} className="space-y-1">
          <div className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1.5 text-sm">
            <span className="font-semibold">{teamLabels[team]}</span>
            <span className="flex gap-3 tabular-nums">
              <span className="w-12 text-right text-stone-400">
                {fmtDelta(teamDelta)}
              </span>
              <span className="w-12 text-right font-semibold text-amber-300">
                {teamTotal}
              </span>
            </span>
          </div>
          {members.map((uid) => playerRow(uid, true))}
        </div>
      ))}
    </div>
  );
}
