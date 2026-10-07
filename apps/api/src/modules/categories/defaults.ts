import { SYSTEM_CATEGORY_KEYS, type Bucket, type CategoryKind } from '@finanzas/shared';

export interface DefaultCategory {
  name: string;
  kind: CategoryKind;
  bucket: Bucket | null;
  icon: string;
  color: string;
  isSystem: boolean;
  systemKey: string | null;
}

const expense = (
  name: string,
  bucket: Bucket,
  icon: string,
  color: string,
  systemKey: string | null = null,
  isSystem = false,
): DefaultCategory => ({
  name,
  kind: 'EXPENSE',
  bucket,
  icon,
  color,
  isSystem,
  systemKey,
});

const income = (
  name: string,
  icon: string,
  color: string,
  systemKey: string | null = null,
  isSystem = false,
): DefaultCategory => ({
  name,
  kind: 'INCOME',
  bucket: null,
  icon,
  color,
  isSystem,
  systemKey,
});

/** Spec 7.7: sin "Ahorro/Inversión" (ahorrar es transferir) y "Intereses y comisiones" en lugar de "Deudas". */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  expense('Vivienda', 'OBLIGATIONS', 'home', '#0ea5e9'),
  expense('Alimentación', 'OBLIGATIONS', 'utensils', '#f97316'),
  expense('Transporte', 'OBLIGATIONS', 'bus', '#6366f1'),
  expense('Servicios', 'OBLIGATIONS', 'zap', '#eab308'),
  expense('Salud', 'OBLIGATIONS', 'heart-pulse', '#ef4444'),
  expense('Educación', 'OBLIGATIONS', 'graduation-cap', '#8b5cf6'),
  expense('Impuestos', 'OBLIGATIONS', 'landmark', '#64748b'),
  expense(
    'Intereses y comisiones',
    'OBLIGATIONS',
    'percent',
    '#be123c',
    SYSTEM_CATEGORY_KEYS.INTEREST,
  ),
  expense('Entretenimiento', 'LEISURE', 'film', '#ec4899'),
  expense('Suscripciones', 'LEISURE', 'repeat', '#14b8a6'),
  expense('Compras', 'OTHER', 'shopping-bag', '#a855f7'),
  expense('Otros', 'OTHER', 'circle-ellipsis', '#94a3b8'),
  expense(
    'Ajuste de saldo',
    'OTHER',
    'scale',
    '#94a3b8',
    SYSTEM_CATEGORY_KEYS.ADJUSTMENT_EXPENSE,
    true,
  ),
  income('Salario', 'briefcase', '#16a34a'),
  income('Freelance', 'laptop', '#22c55e'),
  income('Bonificación', 'gift', '#84cc16'),
  income('Venta', 'tag', '#10b981'),
  income('Ingreso extra', 'circle-plus', '#059669'),
  income('Otros', 'circle-ellipsis', '#94a3b8'),
  income('Ajuste de saldo', 'scale', '#94a3b8', SYSTEM_CATEGORY_KEYS.ADJUSTMENT_INCOME, true),
];
