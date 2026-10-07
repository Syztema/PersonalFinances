import { Link } from 'react-router';
import { EmptyState } from '../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md p-6">
      <EmptyState
        title="Página no encontrada"
        action={
          <Link to="/dashboard" className="text-primary">
            Ir al inicio
          </Link>
        }
      />
    </div>
  );
}
