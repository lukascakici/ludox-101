import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import {
  GameMode,
  LobbyStatus,
  type CreateLobbyInput,
  type Lobby,
  type LobbyPlayer,
} from '@/types/lobby';
import { OKEY101_MAX_PLAYERS } from '@/constants/lobby';

/** Minimal player identity (comes from Firebase Auth). */
export interface LobbyHost {
  uid: string;
  displayName: string;
}

/** Reasons a join/leave action can fail, surfaced to the UI for messaging. */
export type LobbyActionErrorCode =
  | 'not-found'
  | 'not-waiting'
  | 'full'
  | 'wrong-password';

/** Error thrown by join/leave when an action is not allowed. */
export class LobbyActionError extends Error {
  constructor(readonly code: LobbyActionErrorCode) {
    super(code);
    this.name = 'LobbyActionError';
  }
}

const LOBBIES_COLLECTION = 'lobbies';

/**
 * Hashes a lobby password with SHA-256 (Web Crypto). NOTE: this is suitable for
 * low-stakes lobby passwords only — it is not a substitute for proper auth. The
 * raw password is never stored or transmitted.
 */
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Persists a new lobby to Firestore and returns the generated document id.
 *
 * Responsibilities that the form does NOT handle (kept here on purpose):
 *  - assigning the host as the first player,
 *  - deriving `maxPlayers` from the game type,
 *  - hashing the password for private lobbies,
 *  - stamping `createdAt` with the server clock.
 */
export async function createLobby(
  input: CreateLobbyInput,
  host: LobbyHost,
): Promise<string> {
  const { name, settings, password } = input;

  const hostPlayer: LobbyPlayer = {
    uid: host.uid,
    displayName: host.displayName,
    isHost: true,
    ...(settings.gameMode === GameMode.Paired ? { team: 0 } : {}),
  };

  // Build the document. Optional fields are spread conditionally so we never
  // write `undefined` (which Firestore rejects).
  const docData: DocumentData = {
    hostId: host.uid,
    name,
    settings,
    status: LobbyStatus.Waiting,
    players: [hostPlayer],
    maxPlayers: OKEY101_MAX_PLAYERS,
    createdAt: serverTimestamp(),
    ...(settings.isPrivate && password
      ? { passwordHash: await hashPassword(password) }
      : {}),
  };

  const ref = await addDoc(collection(db, LOBBIES_COLLECTION), docData);
  return ref.id;
}

/**
 * Maps a raw Firestore document into a client `Lobby`. Converts the server
 * `Timestamp` to epoch milliseconds and omits the password hash so it never
 * reaches client-facing objects.
 */
function toLobby(id: string, data: DocumentData): Lobby {
  const createdAt =
    data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0;

  return {
    id,
    hostId: data.hostId,
    name: data.name,
    settings: data.settings,
    status: data.status,
    players: data.players,
    maxPlayers: data.maxPlayers,
    createdAt,
  } as Lobby;
}

/**
 * Fetches a single lobby by id, or `null` if it doesn't exist.
 */
export async function getLobby(id: string): Promise<Lobby | null> {
  const snapshot = await getDoc(doc(db, LOBBIES_COLLECTION, id));
  if (!snapshot.exists()) return null;
  return toLobby(snapshot.id, snapshot.data());
}

/**
 * Subscribes to a single lobby in real time. Calls back with `null` if the
 * lobby is deleted or never existed. Returns the unsubscribe function.
 */
export function subscribeToLobby(
  id: string,
  onChange: (lobby: Lobby | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, LOBBIES_COLLECTION, id),
    (snapshot) => {
      onChange(snapshot.exists() ? toLobby(snapshot.id, snapshot.data()) : null);
    },
    (error) => onError?.(error),
  );
}

/**
 * Updates an existing lobby's name and settings (host-only, enforced by rules).
 * Password handling:
 *  - made public  -> existing hash is removed,
 *  - new password  -> re-hashed and stored,
 *  - private with no new password -> existing hash is kept untouched.
 */
export async function updateLobby(
  id: string,
  input: CreateLobbyInput,
): Promise<void> {
  const { name, settings, password } = input;

  const data: DocumentData = { name, settings };
  if (!settings.isPrivate) {
    data.passwordHash = deleteField();
  } else if (password) {
    data.passwordHash = await hashPassword(password);
  }

  await updateDoc(doc(db, LOBBIES_COLLECTION, id), data);
}

/**
 * Starts the match: moves the lobby from Waiting to InProgress. Callers must
 * ensure the lobby is full (4 players) and that the requester is the host;
 * Firestore rules additionally restrict updates to the host.
 */
export async function startLobby(id: string): Promise<void> {
  await updateDoc(doc(db, LOBBIES_COLLECTION, id), {
    status: LobbyStatus.InProgress,
  });
}

/**
 * Seats a player in a lobby. Runs in a transaction so capacity is enforced
 * atomically (no over-seating under concurrent joins). Idempotent: joining a
 * lobby you're already in is a no-op. Verifies the password for private lobbies.
 */
export async function joinLobby(
  id: string,
  player: LobbyHost,
  password?: string,
): Promise<void> {
  const ref = doc(db, LOBBIES_COLLECTION, id);
  const providedHash = password ? await hashPassword(password) : null;

  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new LobbyActionError('not-found');

    const data = snapshot.data();
    if (data.status !== LobbyStatus.Waiting) {
      throw new LobbyActionError('not-waiting');
    }

    const players: LobbyPlayer[] = data.players ?? [];
    if (players.some((existing) => existing.uid === player.uid)) return;
    if (players.length >= data.maxPlayers) throw new LobbyActionError('full');

    if (data.passwordHash && data.passwordHash !== providedHash) {
      throw new LobbyActionError('wrong-password');
    }

    const newPlayer: LobbyPlayer = {
      uid: player.uid,
      displayName: player.displayName,
      isHost: false,
      // Paired mode seats alternate teams (0,1,0,1) around the table.
      ...(data.settings.gameMode === GameMode.Paired
        ? { team: (players.length % 2) as 0 | 1 }
        : {}),
    };

    tx.update(ref, { players: [...players, newPlayer] });
  });
}

/**
 * Removes a player from a lobby. If the host leaves, the lobby is disbanded
 * (deleted). Runs in a transaction to stay consistent with concurrent joins.
 */
export async function leaveLobby(id: string, uid: string): Promise<void> {
  const ref = doc(db, LOBBIES_COLLECTION, id);

  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) return;

    const data = snapshot.data();
    if (data.hostId === uid) {
      tx.delete(ref);
      return;
    }

    const players: LobbyPlayer[] = data.players ?? [];
    tx.update(ref, {
      players: players.filter((existing) => existing.uid !== uid),
    });
  });
}

/**
 * Subscribes to the live list of open (waiting) lobbies. Sorting is done client
 * side (newest first) to avoid needing a Firestore composite index. Returns the
 * unsubscribe function.
 */
export function subscribeToOpenLobbies(
  onChange: (lobbies: Lobby[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const openLobbies = query(
    collection(db, LOBBIES_COLLECTION),
    where('status', '==', LobbyStatus.Waiting),
  );

  return onSnapshot(
    openLobbies,
    (snapshot) => {
      const lobbies = snapshot.docs
        .map((document) => toLobby(document.id, document.data()))
        .sort((a, b) => b.createdAt - a.createdAt);
      onChange(lobbies);
    },
    (error) => onError?.(error),
  );
}
