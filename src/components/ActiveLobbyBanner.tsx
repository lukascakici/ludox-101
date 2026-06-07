import { Link } from 'react-router-dom';

/** Notice shown when the user is already in a lobby, with a way back to it. */
export function ActiveLobbyBanner({ lobbyId }: { lobbyId: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-300 bg-white px-4 py-3 text-sm dark:border-felt-700 dark:bg-felt-900">
      <span className="text-zinc-700 dark:text-zinc-200">
        Zaten bir lobidesin.
      </span>
      <Link
        to={`/lobby/${lobbyId}`}
        className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Lobine dön
      </Link>
    </div>
  );
}
