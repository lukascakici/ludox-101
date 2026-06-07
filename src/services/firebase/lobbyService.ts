import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  type DocumentData,
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
 * Fetches a single lobby by id, or `null` if it doesn't exist.
 * Converts the Firestore `Timestamp` to epoch milliseconds and drops the
 * password hash from the client-facing object.
 */
export async function getLobby(id: string): Promise<Lobby | null> {
  const snapshot = await getDoc(doc(db, LOBBIES_COLLECTION, id));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  const createdAt =
    data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0;

  return {
    id: snapshot.id,
    hostId: data.hostId,
    name: data.name,
    settings: data.settings,
    status: data.status,
    players: data.players,
    maxPlayers: data.maxPlayers,
    createdAt,
  } as Lobby;
}
