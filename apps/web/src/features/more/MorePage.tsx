import { ChevronRight, LogOut } from 'lucide-react';
import { Link } from 'react-router';
import { SECONDARY_NAV } from '../../app/navigation';
import { Button } from '../../components/ui/Button';
import { useLogout } from '../auth/useAuth';

export function MorePage() {
  const logout = useLogout();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Más</h1>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {SECONDARY_NAV.map(({ to, label, icon: IconComponent }) => (
          <li key={to}>
            <Link to={to} className="flex min-h-14 items-center gap-3 px-4">
              <IconComponent size={20} className="text-muted" aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronRight size={18} className="text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        size="lg"
        loading={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut size={18} /> Cerrar sesión
      </Button>
      <p className="px-1 text-xs text-muted">
        Finanzas es un asistente basado únicamente en los datos que registras. No es asesoría
        financiera profesional.
      </p>
    </div>
  );
}
