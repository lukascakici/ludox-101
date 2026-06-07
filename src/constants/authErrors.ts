import { FirebaseError } from 'firebase/app';

/** Maps Firebase Auth error codes to user-friendly Turkish messages. */
const authErrorMessages: Record<string, string> = {
  'auth/email-already-in-use': 'Bu e-posta zaten kullanımda.',
  'auth/invalid-email': 'Geçersiz e-posta adresi.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
  'auth/missing-password': 'Lütfen bir şifre gir.',
  'auth/invalid-credential': 'E-posta veya şifre hatalı.',
  'auth/wrong-password': 'E-posta veya şifre hatalı.',
  'auth/user-not-found': 'E-posta veya şifre hatalı.',
  'auth/user-disabled': 'Bu hesap devre dışı bırakılmış.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.',
  'auth/network-request-failed': 'Ağ hatası. Bağlantını kontrol et.',
  'auth/operation-not-allowed':
    'Bu giriş yöntemi etkin değil. (Firebase Console’dan açılmalı.)',
};

/** Returns a Turkish message for any auth error (falls back to a generic one). */
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return (
      authErrorMessages[error.code] ?? 'Bir hata oluştu. Lütfen tekrar dene.'
    );
  }
  return 'Beklenmeyen bir hata oluştu.';
}
