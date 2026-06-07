import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAuthListener } from '@/hooks/useAuthListener';
import { RootLayout } from '@/components/layout/RootLayout';

// Route pages are code-split so each loads on demand.
const LobbyListPage = lazy(() =>
  import('@/pages/LobbyListPage').then((m) => ({ default: m.LobbyListPage })),
);
const CreateLobbyPage = lazy(() =>
  import('@/pages/CreateLobbyPage').then((m) => ({ default: m.CreateLobbyPage })),
);
const LobbyPage = lazy(() =>
  import('@/pages/LobbyPage').then((m) => ({ default: m.LobbyPage })),
);

function App() {
  // Bind theme and auth state to the app once at the root.
  useTheme();
  useAuthListener();

  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<LobbyListPage />} />
        <Route path="create" element={<CreateLobbyPage />} />
        <Route path="lobby/:id" element={<LobbyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
