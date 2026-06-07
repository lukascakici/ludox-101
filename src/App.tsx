import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CreateLobbyForm } from '@/components/CreateLobbyForm';
import type { CreateLobbyInput } from '@/types/lobby';

function App() {
  // Activate the theme binding once at the app root.
  useTheme();

  // Temporary: hold the last submitted form data to preview it on screen.
  // Replaced by Firestore persistence + navigation in a later phase.
  const [lastSubmitted, setLastSubmitted] = useState<CreateLobbyInput | null>(
    null,
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 transition-colors dark:bg-felt-950 dark:text-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-felt-800">
        <span className="text-lg font-semibold tracking-tight">Ludox</span>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-xl px-6 py-12">
        <CreateLobbyForm onSubmit={setLastSubmitted} />

        {lastSubmitted && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-felt-800 dark:bg-felt-900">
            <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Oluşturulacak lobi (önizleme):
            </p>
            <pre className="overflow-x-auto text-xs text-zinc-600 dark:text-zinc-300">
              {JSON.stringify(lastSubmitted, null, 2)}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
