import {
  ArrowLeftRight,
  ChartPie,
  CreditCard,
  House,
  Landmark,
  Menu,
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

export const SECONDARY_NAV: NavItem[] = [
  { to: '/accounts', label: 'Mis cuentas', icon: Wallet },
  { to: '/cards', label: 'Tarjetas', icon: CreditCard },
  { to: '/debts', label: 'Préstamos', icon: Landmark },
  { to: '/categories', label: 'Categorías', icon: Tags },
  { to: '/profile', label: 'Perfil y seguridad', icon: UserRound },
];
