import { Navigate, Route, Routes } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAuthListener } from '@/hooks/useAuthListener';
import { RootLayout } from '@/components/layout/RootLayout';
import { LobbyListPage } from '@/pages/LobbyListPage';
import { CreateLobbyPage } from '@/pages/CreateLobbyPage';
import { LobbyPage } from '@/pages/LobbyPage';

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
