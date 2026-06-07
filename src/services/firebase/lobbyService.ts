import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
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

/** Minimal identity needed to create a lobby (comes from Firebase Auth later). */
export interface LobbyHost {
  uid: string;
  displayName: string;
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
