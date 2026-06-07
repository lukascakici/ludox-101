import { FirebaseError } from 'firebase/app';
import {
  LobbyActionError,
  type LobbyActionErrorCode,
} from '@/services/firebase/lobbyService';

/** Turkish messages for lobby join/leave failures. */
const joinErrorMessages: Record<LobbyActionErrorCode, string> = {
  'not-found': 'Lobi bulunamadı.',
  'not-waiting': 'Oyun zaten başlamış.',
  full: 'Lobi dolu.',
  'wrong-password': 'Şifre hatalı.',
};

/** Returns a Turkish message for a join/leave error. */
export function getJoinErrorMessage(error: unknown): string {
  if (error instanceof LobbyActionError) {
    return joinErrorMessages[error.code];
  }
  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied') {
      return 'İzin reddedildi — güvenlik kuralları katılmaya izin vermiyor.';
    }
    return `Lobiye katılınamadı (${error.code}).`;
  }
  return 'Lobiye katılınamadı. Lütfen tekrar dene.';
}
