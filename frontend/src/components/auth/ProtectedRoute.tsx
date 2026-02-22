import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuthStore } from '../../stores/authStore';

export default function ProtectedRoute() {
  const authReady = useAuthStore((state) => state.authReady);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!authReady) {
    return <div style={{ padding: '2rem', color: '#f6e8c8' }}>Checking authentication...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
