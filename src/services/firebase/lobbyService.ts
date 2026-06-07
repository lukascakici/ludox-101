import {
  addDoc,
  collection,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './config';
import {
  GameMode,
  LobbyStatus,
  type CreateLobbyInput,
  type LobbyPlayer,
} from '@/types/lobby';
import { gamePlayerCounts } from '@/constants/lobby';

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
    maxPlayers: gamePlayerCounts[settings.gameType],
    createdAt: serverTimestamp(),
    ...(settings.isPrivate && password
      ? { passwordHash: await hashPassword(password) }
      : {}),
  };

  const ref = await addDoc(collection(db, LOBBIES_COLLECTION), docData);
  return ref.id;
}
