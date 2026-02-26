import { Navigate, Outlet, useLocation } from 'react-router';

import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';

export default function ProtectedRoute() {
  const authReady = useAuthStore((state) => state.authReady);
  const user = useAuthStore((state) => state.user);
  const { t } = useI18n();
  const location = useLocation();

  if (!authReady) {
    return <div style={{ padding: '2rem', color: '#f6e8c8' }}>{t('Checking authentication...')}</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
