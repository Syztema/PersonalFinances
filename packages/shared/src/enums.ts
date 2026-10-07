export const ACCOUNT_TYPES = [
  'CASH',
  'BANK',
  'DIGITAL_WALLET',
  'SAVINGS',
  'INVESTMENT',
  'OTHER',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const LIQUID_ACCOUNT_TYPES: readonly AccountType[] = [
  'CASH',
  'BANK',
  'DIGITAL_WALLET',
  'OTHER',
];
export const isLiquidAccount = (type: AccountType) => LIQUID_ACCOUNT_TYPES.includes(type);

export const TRANSACTION_TYPES = [
  'INCOME',
  'EXPENSE',
  'TRANSFER',
  'CARD_PURCHASE',
  'CARD_PAYMENT',
  'DEBT_PAYMENT',
  'DEBT_DISBURSEMENT',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CATEGORY_KINDS = ['INCOME', 'EXPENSE'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const BUCKETS = ['OBLIGATIONS', 'LEISURE', 'OTHER'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const PAYMENT_METHODS = [
  'CASH',
  'DEBIT_CARD',
  'BANK_TRANSFER',
  'DIGITAL_WALLET',
  'OTHER',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DERIVED_METHODS = [
  'CASH',
  'BANK',
  'DIGITAL_WALLET',
  'DEBIT_CARD',
  'BANK_TRANSFER',
  'CREDIT_CARD',
  'OTHER',
] as const;
export type DerivedMethod = (typeof DERIVED_METHODS)[number];

export const FREQUENCIES = ['WEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'YEARLY', 'CUSTOM_DAYS'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const SCHEDULED_KINDS = ['INCOME', 'EXPENSE'] as const;
export type ScheduledKind = (typeof SCHEDULED_KINDS)[number];

export const SCHEDULED_STATUSES = ['PENDING', 'DONE', 'SKIPPED'] as const;
export type ScheduledStatus = (typeof SCHEDULED_STATUSES)[number];

export const GOAL_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const THEMES = ['SYSTEM', 'LIGHT', 'DARK'] as const;
export type Theme = (typeof THEMES)[number];

export const SYSTEM_CATEGORY_KEYS = {
  INTEREST: 'INTEREST',
  ADJUSTMENT_EXPENSE: 'ADJUSTMENT_EXPENSE',
  ADJUSTMENT_INCOME: 'ADJUSTMENT_INCOME',
} as const;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: 'Efectivo',
  BANK: 'Cuenta bancaria',
  DIGITAL_WALLET: 'Billetera digital',
  SAVINGS: 'Ahorro',
  INVESTMENT: 'Inversión',
  OTHER: 'Otra',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia',
  CARD_PURCHASE: 'Compra con tarjeta',
  CARD_PAYMENT: 'Pago de tarjeta',
  DEBT_PAYMENT: 'Pago de préstamo',
  DEBT_DISBURSEMENT: 'Desembolso de préstamo',
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  OBLIGATIONS: 'Obligaciones',
  LEISURE: 'Entretenimiento',
  OTHER: 'Otros',
};

export const DERIVED_METHOD_LABELS: Record<DerivedMethod, string> = {
  CASH: 'Efectivo',
  BANK: 'Cuenta bancaria',
  DIGITAL_WALLET: 'Billetera digital',
  DEBIT_CARD: 'Tarjeta débito',
  BANK_TRANSFER: 'Transferencia',
  CREDIT_CARD: 'Tarjeta crédito',
  OTHER: 'Otro',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  DEBIT_CARD: 'Tarjeta débito',
  BANK_TRANSFER: 'Transferencia',
  DIGITAL_WALLET: 'Billetera digital',
  OTHER: 'Otro',
};

/** Método de pago para filtros y gráficos: sobrescritura, tarjeta de crédito o tipo de cuenta. */
export function deriveMethod(
  type: TransactionType,
  paymentMethod: PaymentMethod | null,
  accountType: AccountType | null,
): DerivedMethod | null {
  if (type === 'CARD_PURCHASE') return 'CREDIT_CARD';
  if (type !== 'EXPENSE') return null;
  if (paymentMethod) return paymentMethod;
  switch (accountType) {
    case 'CASH':
      return 'CASH';
    case 'BANK':
      return 'BANK';
    case 'DIGITAL_WALLET':
      return 'DIGITAL_WALLET';
    default:
      return 'OTHER';
  }
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY: 'Semanal',
  SEMIMONTHLY: 'Quincenal',
  MONTHLY: 'Mensual',
  YEARLY: 'Anual',
  CUSTOM_DAYS: 'Cada N días',
};

export const THEME_LABELS: Record<Theme, string> = {
  DARK: 'Oscuro',
  LIGHT: 'Claro',
  SYSTEM: 'Según el sistema',
};
