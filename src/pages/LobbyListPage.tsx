import { Link } from 'react-router-dom';

/**
 * Home page: lists open lobbies. Live listing from Firestore is added in the
 * next phase; for now it offers a way into lobby creation.
 */
export function LobbyListPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Lobiler</h1>
        <Link
          to="/create"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Lobi Oluştur
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-felt-800 dark:bg-felt-900 dark:text-zinc-400">
        Açık lobi listesi yakında eklenecek. Şimdilik yeni bir lobi
        oluşturabilirsin.
      </div>
    </div>
  );
}
