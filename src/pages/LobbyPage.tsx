import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  joinLobby,
  leaveLobby,
  setPlayerTeam,
  subscribeToLobby,
  swapPlayerTeams,
  updateLobby,
} from '@/services/firebase/lobbyService';
import {
  fillLobbyWithBots,
  startGame,
  startSoloTestGame,
} from '@/services/firebase/gameService';
import {
  PAIRED_TEAM_SIZE,
  TEAMS,
  formatMatchSummary,
  gameModeLabels,
  isLobbyFull,
  playersInTeam,
  teamLabels,
  teamsBalanced,
} from '@/constants/lobby';
import { getJoinErrorMessage } from '@/constants/joinErrors';
import { useActiveLobby } from '@/hooks/useActiveLobby';
import { useAuthStore } from '@/store/authStore';
import { LobbyForm } from '@/components/LobbyForm';
import { ActiveLobbyBanner } from '@/components/ActiveLobbyBanner';
import { Input } from '@/components/ui/Input';
import {
  GameMode,
  LobbyStatus,
  type CreateLobbyInput,
  type Lobby,
} from '@/types/lobby';

type LoadState = 'loading' | 'ready' | 'notfound' | 'error';

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-2 last:border-0 dark:border-felt-800">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
        {value}
      </span>
    </div>
  );
}

/** Lobby room. Subscribes in real time so player joins and game start show live. */
export function LobbyPage() {
  const { id } = useParams<{ id: string }>();
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

  return (
    <div className="space-y-4">
      <Link
        to="/"
        className="inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Lobilere dön
      </Link>

      {state === 'loading' && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Yükleniyor…</p>
      )}

      {state === 'notfound' && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Lobi bulunamadı.
        </p>
      )}

      {state === 'error' && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Lobi yüklenirken bir hata oluştu.
        </p>
      )}

      {state === 'ready' && lobby && <LobbyRoom lobby={lobby} />}
    </div>
  );
}

function LobbyRoom({ lobby }: { lobby: Lobby }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const currentUid = user?.uid;
  const { settings } = lobby;
  const rules = settings.gameRules;

  const activeLobbyId = useActiveLobby();

  const isHost = currentUid === lobby.hostId;
  const isMember = lobby.players.some((p) => p.uid === currentUid);
  const full = isLobbyFull(lobby);
  const waiting = lobby.status === LobbyStatus.Waiting;
  const inProgress = lobby.status === LobbyStatus.InProgress;
  const missing = Math.max(0, lobby.maxPlayers - lobby.players.length);
  const paired = settings.gameMode === GameMode.Paired;
  // Paired mode can only start once the teams are exactly 2 vs 2.
  const balanced = !paired || teamsBalanced(lobby.players);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [leaving, setLeaving] = useState(false);

  const canEdit = isHost && waiting;

  async function handleJoin() {
    if (!user) return;
    setJoinError(null);
    setJoining(true);
    try {
      await joinLobby(
        lobby.id,
        { uid: user.uid, displayName: user.displayName?.trim() || 'Oyuncu' },
        settings.isPrivate ? joinPassword : undefined,
      );
      // Realtime subscription will seat us; no manual update needed.
    } catch (err) {
      console.error('joinLobby failed:', err);
      setJoinError(getJoinErrorMessage(err));
    } finally {
      setJoining(false);
    }
  }

  async function handleSetTeam(targetUid: string, team: 0 | 1) {
    if (!currentUid) return;
    try {
      await setPlayerTeam(lobby.id, currentUid, targetUid, team);
    } catch (err) {
      console.error('setPlayerTeam failed:', err);
    }
  }

  async function handleSwapTeams(uidA: string, uidB: string) {
    if (!currentUid) return;
    try {
      await swapPlayerTeams(lobby.id, currentUid, uidA, uidB);
    } catch (err) {
      console.error('swapPlayerTeams failed:', err);
    }
  }

  async function handleFillBots() {
    try {
      await fillLobbyWithBots(lobby);
    } catch (err) {
      console.error('fillLobbyWithBots failed:', err);
    }
  }

  async function handleLeave() {
    if (!currentUid) return;
    setLeaving(true);
    try {
      await leaveLobby(lobby.id, currentUid);
      navigate('/');
    } catch (err) {
      console.error('leaveLobby failed:', err);
      setLeaving(false);
    }
  }

  async function handleSave(input: CreateLobbyInput) {
    setSaveError(null);
    try {
      await updateLobby(lobby.id, input);
      setEditing(false);
    } catch (err) {
      console.error('updateLobby failed:', err);
      setSaveError('Ayarlar kaydedilemedi.');
    }
  }

  async function handleStart() {
    if (!currentUid) return;
    setStartError(null);
    setStarting(true);
    try {
      await startGame(lobby, currentUid);
    } catch (err) {
      console.error('startGame failed:', err);
      setStartError('Oyun başlatılamadı.');
    } finally {
      setStarting(false);
    }
  }

  async function handleSoloTest() {
    if (!currentUid) return;
    setStartError(null);
    try {
      await startSoloTestGame(lobby, currentUid);
    } catch (err) {
      console.error('startSoloTestGame failed:', err);
      setStartError('Test oyunu başlatılamadı.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-felt-800 dark:bg-felt-900">
        <h1 className="text-2xl font-bold tracking-tight">{lobby.name}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {lobby.players.length}/{lobby.maxPlayers} oyuncu
        </p>

        {/* Players — team boxes in paired mode, a flat list in solo mode. */}
        {paired ? (
          <TeamColumns
            lobby={lobby}
            canArrange={isHost && waiting}
            onSetTeam={handleSetTeam}
            onSwap={handleSwapTeams}
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {lobby.players.map((player) => (
              <li
                key={player.uid}
                className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-felt-800"
              >
                <span className="text-zinc-800 dark:text-zinc-100">
                  {player.displayName}
                </span>
                {player.isHost && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Kurucu
                  </span>
                )}
              </li>
            ))}
            {Array.from({ length: missing }).map((_, index) => (
              <li
                key={`empty-${index}`}
                className="rounded-md border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-400 dark:border-felt-800 dark:text-zinc-500"
              >
                Boş koltuk
              </li>
            ))}
          </ul>
        )}

        {/* Actions: join / leave / start */}
        <div className="mt-5 space-y-2">
          {inProgress ? (
            <Link
              to={`/game/${lobby.id}`}
              className="block w-full rounded-md bg-zinc-900 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Masaya Gir
            </Link>
          ) : isMember ? (
            <>
              {!full && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Oyunun başlaması için {lobby.maxPlayers} oyuncu gerekli.
                  {missing > 0 && ` ${missing} oyuncu bekleniyor.`}
                </p>
              )}
              {full && paired && !balanced && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Takımlar 2-2 olmalı. Kurucu oyuncuları takımlara dağıtmalı.
                </p>
              )}
              {isHost && (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!full || !waiting || !balanced || starting}
                  className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  {starting ? 'Başlatılıyor…' : 'Oyunu Başlat'}
                </button>
              )}
              {import.meta.env.DEV && isHost && !full && waiting && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleFillBots}
                    className="flex-1 rounded-md border border-amber-400 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-felt-800"
                  >
                    Botlarla doldur
                  </button>
                  <button
                    type="button"
                    onClick={handleSoloTest}
                    className="flex-1 rounded-md border border-amber-400 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-felt-800"
                  >
                    Botlarla başlat
                  </button>
                </div>
              )}
              {startError && (
                <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {startError}
                </p>
              )}
              <button
                type="button"
                onClick={handleLeave}
                disabled={leaving}
                className="w-full rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-felt-700 dark:text-zinc-200 dark:hover:bg-felt-800"
              >
                {isHost ? 'Lobiyi Dağıt' : 'Lobiden Ayrıl'}
              </button>
            </>
          ) : activeLobbyId && activeLobbyId !== lobby.id ? (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Başka bir lobidesin. Katılmak için önce oradan ayrıl.
              </p>
              <ActiveLobbyBanner lobbyId={activeLobbyId} />
            </div>
          ) : full ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Lobi dolu.
            </p>
          ) : (
            <>
              {settings.isPrivate && (
                <Input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  maxLength={32}
                  placeholder="Lobi şifresi"
                />
              )}
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining}
                className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {joining ? 'Katılınıyor…' : 'Lobiye Katıl'}
              </button>
              {joinError && (
                <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {joinError}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Settings — editable by the host while waiting */}
      {editing ? (
        <>
          <LobbyForm
            mode="edit"
            initialName={lobby.name}
            initialSettings={settings}
            onSubmit={handleSave}
            onCancel={() => {
              setEditing(false);
              setSaveError(null);
            }}
          />
          {saveError && (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {saveError}
            </p>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-felt-800 dark:bg-felt-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Ayarlar
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-felt-700 dark:text-zinc-200 dark:hover:bg-felt-800"
              >
                Ayarları Düzenle
              </button>
            )}
          </div>
          <div className="mt-3">
          <SummaryRow label="Mod" value={gameModeLabels[settings.gameMode]} />
          <SummaryRow
            label="Maç"
            value={formatMatchSummary(settings.matchFormat)}
          />
          <SummaryRow
            label="Hamle Süresi"
            value={`${settings.turnDuration} sn`}
          />
          <SummaryRow
            label="Ceza Sistemi"
            value={rules.floorPenalty ? 'Cezalı' : 'Cezasız'}
          />
          <SummaryRow
            label="Rekor Cezası"
            value={rules.rekorPenalty ? 'Rekorlu' : 'Rekorsuz'}
          />
          <SummaryRow
            label="Katlama"
            value={rules.doubling ? 'Katlamalı' : 'Katlamasız'}
          />
          <SummaryRow
            label="Yardım"
            value={(settings.assisted ?? true) ? 'Destekli' : 'Desteksiz'}
          />
          <SummaryRow
            label="Gizlilik"
            value={settings.isPrivate ? 'Şifreli' : 'Herkese Açık'}
          />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Paired-mode team selection: two team boxes (2 seats each). The host arranges
 * players (incl. bots) by drag-and-drop — drop onto an empty slot to MOVE, or
 * onto another player to SWAP (the only way to rearrange a full 2-2). The `→/←`
 * buttons are a tap-friendly fallback for when a team has an open slot. Partners
 * end up sitting across the table when the game starts. Non-hosts see it
 * read-only.
 */
function TeamColumns({
  lobby,
  canArrange,
  onSetTeam,
  onSwap,
}: {
  lobby: Lobby;
  canArrange: boolean;
  onSetTeam: (uid: string, team: 0 | 1) => void;
  onSwap: (uidA: string, uidB: string) => void;
}) {
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [overTeam, setOverTeam] = useState<0 | 1 | null>(null);

  function endDrag() {
    setDragUid(null);
    setOverTeam(null);
  }

  // Drop onto a slot: swap with the occupant, or move into an empty slot.
  function dropOnto(team: 0 | 1, occupantUid: string | null) {
    if (!dragUid) return;
    if (occupantUid && occupantUid !== dragUid) onSwap(dragUid, occupantUid);
    else if (!occupantUid) onSetTeam(dragUid, team);
    endDrag();
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      {TEAMS.map((team) => {
        const members = playersInTeam(lobby.players, team);
        const emptySlots = Math.max(0, PAIRED_TEAM_SIZE - members.length);
        const otherTeam = (team === 0 ? 1 : 0) as 0 | 1;
        const otherFull =
          playersInTeam(lobby.players, otherTeam).length >= PAIRED_TEAM_SIZE;
        const highlight = canArrange && dragUid && overTeam === team;
        return (
          <div
            key={team}
            onDragOver={
              canArrange
                ? (e) => {
                    e.preventDefault();
                    setOverTeam(team);
                  }
                : undefined
            }
            className={`rounded-lg border p-3 transition-colors ${
              highlight
                ? 'border-amber-400 bg-amber-50/60 dark:border-amber-400 dark:bg-felt-800'
                : 'border-zinc-200 dark:border-felt-800'
            }`}
          >
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {teamLabels[team]}
            </h3>
            <ul className="space-y-2">
              {members.map((player) => (
                <li
                  key={player.uid}
                  draggable={canArrange}
                  onDragStart={
                    canArrange
                      ? (e) => {
                          // Required for Firefox to initiate the drag.
                          e.dataTransfer.setData('text/plain', player.uid);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragUid(player.uid);
                        }
                      : undefined
                  }
                  onDragEnd={endDrag}
                  onDrop={
                    canArrange
                      ? (e) => {
                          e.preventDefault();
                          dropOnto(team, player.uid);
                        }
                      : undefined
                  }
                  className={`flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-2.5 py-2 text-sm dark:border-felt-800 ${
                    canArrange ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${dragUid === player.uid ? 'opacity-50' : ''}`}
                >
                  <span className="truncate text-zinc-800 dark:text-zinc-100">
                    {player.displayName}
                    {player.isHost && (
                      <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">
                        (Kurucu)
                      </span>
                    )}
                  </span>
                  {canArrange && (
                    <button
                      type="button"
                      onClick={() => onSetTeam(player.uid, otherTeam)}
                      disabled={otherFull}
                      title="Diğer takıma al"
                      className="shrink-0 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-30 dark:border-felt-700 dark:text-zinc-300 dark:hover:bg-felt-800"
                    >
                      {team === 0 ? '→' : '←'}
                    </button>
                  )}
                </li>
              ))}
              {Array.from({ length: emptySlots }).map((_, index) => (
                <li
                  key={`empty-${team}-${index}`}
                  onDrop={
                    canArrange
                      ? (e) => {
                          e.preventDefault();
                          dropOnto(team, null);
                        }
                      : undefined
                  }
                  className="rounded-md border border-dashed border-zinc-200 px-2.5 py-2 text-sm text-zinc-400 dark:border-felt-800 dark:text-zinc-500"
                >
                  Boş
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
