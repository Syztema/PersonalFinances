import { Navigate, Outlet } from 'react-router';
import { PageSpinner } from '../components/ui/Spinner';
import { useMe } from '../features/auth/useAuth';

export function PublicOnly() {
  const me = useMe();
  if (me.isPending) return <PageSpinner />;
  if (me.isSuccess) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
