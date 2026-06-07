import { FirebaseError } from 'firebase/app';

/** Maps common Firestore error codes to Turkish messages. */
const firestoreErrorMessages: Record<string, string> = {
  'permission-denied':
    'İzin reddedildi — Firestore güvenlik kuralları lobi oluşturmaya izin vermiyor.',
  unavailable: 'Firestore’a ulaşılamıyor. Bağlantını kontrol et.',
  unauthenticated: 'Oturum doğrulanamadı. Tekrar giriş yapmayı dene.',
  'not-found':
    'Firestore veritabanı bulunamadı. Firebase Console’dan oluşturulmalı.',
};

/**
 * Returns a Turkish message for a lobby/Firestore error. For unmapped codes it
 * includes the raw code, which is useful while wiring things up.
 */
export function getLobbyErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return (
      firestoreErrorMessages[error.code] ??
      `Lobi oluşturulamadı (${error.code}).`
    );
  }
  return 'Lobi oluşturulamadı. Lütfen tekrar dene.';
}
