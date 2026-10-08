import { Plus } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '../lib/cn';
import { useQuickAdd } from '../features/quick-add/QuickAddContext';
import { PRIMARY_NAV, type NavItem } from './navigation';

function Item({ to, label, icon: IconComponent }: NavItem) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]',
            isActive ? 'font-medium text-primary' : 'text-muted',
          )
        }
      >
        <IconComponent size={22} aria-hidden />
        {label}
      </NavLink>
    </li>
  );
}

export function BottomNav() {
  const { open } = useQuickAdd();
  const [first, second, third, fourth] = PRIMARY_NAV as [NavItem, NavItem, NavItem, NavItem];
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end">
        <Item {...first} />
        <Item {...second} />
        <li className="flex justify-center">
          <button
            type="button"
            aria-label="Agregar movimiento"
            onClick={() => open({ kind: 'menu' })}
            className="-mt-6 mb-1 flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg ring-4 ring-bg active:scale-95"
          >
            <Plus size={28} />
          </button>
        </li>
        <Item {...third} />
        <Item {...fourth} />
      </ul>
    </nav>
  );
}
