import {
  ArrowLeftRight,
  Bell,
  ChartColumn,
  ChartPie,
  CreditCard,
  House,
  Landmark,
  Menu,
  Repeat,
  SlidersHorizontal,
  Target,
  Tags,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Inicio', icon: House },
  { to: '/transactions', label: 'Movimientos', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Presupuestos', icon: ChartPie },
  { to: '/more', label: 'Más', icon: Menu },
];

/** Reportes va primero: es la primera opción de "Más" y, en la barra lateral, sigue a Presupuestos. */
export const SECONDARY_NAV: NavItem[] = [
  { to: '/reports', label: 'Reportes', icon: ChartColumn },
  { to: '/accounts', label: 'Mis cuentas', icon: Wallet },
  { to: '/cards', label: 'Tarjetas', icon: CreditCard },
  { to: '/debts', label: 'Préstamos', icon: Landmark },
  { to: '/goals', label: 'Metas', icon: Target },
  { to: '/recurring', label: 'Recurrentes y obligaciones', icon: Repeat },
  { to: '/categories', label: 'Categorías', icon: Tags },
  { to: '/alerts', label: 'Alertas', icon: Bell },
  { to: '/settings', label: 'Configuración', icon: SlidersHorizontal },
  { to: '/profile', label: 'Perfil y seguridad', icon: UserRound },
];
