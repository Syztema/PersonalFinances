import { WifiOff } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { useMe } from '../features/auth/useAuth';
import { ApiError } from '../lib/api';

export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <PageSpinner />;
  if (me.isError && (!me.data || (me.error instanceof ApiError && me.error.status === 401))) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return (
        <Navigate
          to="/login"
          replace
          state={{ from: location.pathname, expired: me.error.code === 'SESSION_EXPIRED' }}
        />
      );
    }
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState
          icon={<WifiOff />}
          title="Sin conexión con el servidor"
          description="Revisa tu internet e intenta de nuevo."
          action={<Button onClick={() => void me.refetch()}>Reintentar</Button>}
        />
      </div>
    );
  }
  return <Outlet />;
}
