import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';

import ProtectedRoute from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout';
import { ErrorBoundary } from './components/ui';
import AuthPage from './pages/Auth';
import Dashboard from './pages/Dashboard';
import StoryStudio from './pages/StoryStudio';
import LorebookEditor from './pages/LorebookEditor';
import Gallery from './pages/Gallery';
import Crossroads from './pages/Crossroads';
import LandingPage from './pages/LandingPage';
import { useAuthStore } from './stores/authStore';

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const authReady = useAuthStore((state) => state.authReady);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const rootElement = !authReady
    ? <div style={{ padding: '2rem', color: '#f6e8c8' }}>Checking authentication...</div>
    : user
      ? <Navigate to="/dashboard" replace />
      : <LandingPage />;

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/story-studio" element={<StoryStudio />} />
            <Route path="/lorebook" element={<LorebookEditor />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/crossroads" element={<Crossroads />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
        <Route path="/" element={rootElement} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
