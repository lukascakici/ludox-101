import { useTheme } from '@/hooks/useTheme';
import { ThemeToggle } from '@/components/ThemeToggle';

function App() {
  // Activate the theme binding once at the app root.
  useTheme();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 transition-colors dark:bg-felt-950 dark:text-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-felt-800">
        <span className="text-lg font-semibold tracking-tight">Ludox</span>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Okey 101</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-300">
          Gerçek zamanlı, çok oyunculu oyun platformu.
        </p>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-felt-800 dark:bg-felt-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Tema altyapısı hazır. Sağ üstteki butonla açık/koyu tema arasında
            geçiş yapabilirsin — seçim kalıcıdır. Koyu tema, klasik Okey çuhası
            tonundadır.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
