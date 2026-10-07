import { Link } from 'react-router';
import { EmptyState } from '../../components/ui/EmptyState';

export function NeedsAccount({
  onNavigate,
  title = 'Primero crea una cuenta',
  description = 'Registra dónde tienes tu dinero (efectivo, banco o billetera) para poder anotar movimientos.',
}: {
  onNavigate: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <Link
          to="/accounts"
          onClick={onNavigate}
          className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-medium text-primary-fg"
        >
          Ir a Mis cuentas
        </Link>
      }
    />
  );
}
