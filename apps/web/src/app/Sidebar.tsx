import { Plus } from 'lucide-react';
import { NavLink } from 'react-router';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';
import { useQuickAdd } from '../features/quick-add/QuickAddContext';
import { PRIMARY_NAV, SECONDARY_NAV } from './navigation';

export function Sidebar() {
  const { open } = useQuickAdd();
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm',
      isActive ? 'bg-primary/10 font-medium text-primary' : 'text-fg hover:bg-surface-2',
    );
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 lg:flex print:hidden">
      <div className="flex items-center gap-2 px-2">
        <img src="/favicon.svg" alt="" className="size-8" />
        <span className="text-lg font-semibold">Finanzas</span>
      </div>
      <Button onClick={() => open({ kind: 'menu' })}>
        <Plus size={18} /> Agregar
      </Button>
      <nav aria-label="Navegación" className="flex flex-col gap-1">
        {[...PRIMARY_NAV.filter((i) => i.to !== '/more'), ...SECONDARY_NAV].map(
          ({ to, label, icon: IconComponent }) => (
            <NavLink key={to} to={to} className={link}>
              <IconComponent size={18} aria-hidden /> {label}
            </NavLink>
          ),
        )}
      </nav>
      <p className="mt-auto px-2 text-xs text-muted">
        Finanzas es un asistente basado únicamente en los datos que registras. No es asesoría
        financiera profesional.
      </p>
    </aside>
  );
}
