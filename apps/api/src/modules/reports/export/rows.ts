import {
  DERIVED_METHOD_LABELS,
  deriveMethod,
  TRANSACTION_TYPE_LABELS,
  type AccountType,
  type IsoDate,
  type PaymentMethod,
  type TransactionType,
} from '@finanzas/shared';

/** Spec Fase 3 §4: columnas de la exportación, en este orden. */
export const EXPORT_COLUMNS = [
  'Fecha',
  'Tipo',
  'Descripción',
  'Categoría',
  'Subcategoría',
  'Cuenta',
  'Cuenta destino',
  'Tarjeta',
  'Préstamo',
  'Cuotas',
  'Método de pago',
  'Valor',
  'Etiquetas',
  'Notas',
] as const;

/** Spec Fase 3 §4: "Desembolso" (más corto que la etiqueta de la app). */
export const EXPORT_TYPE_LABELS: Record<TransactionType, string> = {
  ...TRANSACTION_TYPE_LABELS,
  DEBT_DISBURSEMENT: 'Desembolso',
};

/** Movimiento tal como sale de la base para exportarlo (nombres sin marca de eliminado). */
export interface ExportTransaction {
  type: TransactionType;
  date: IsoDate;
  amount: number;
  description: string | null;
  notes: string | null;
  installments: number | null;
  paymentMethod: PaymentMethod | null;
  account: { name: string; type: AccountType } | null;
  toAccount: { name: string } | null;
  creditCard: { name: string } | null;
  debt: { name: string } | null;
  category: { name: string; parent: { name: string } | null } | null;
  tags: string[];
}

/** Una fila de la exportación; los textos vacíos son ''. */
export interface ExportRow {
  date: IsoDate;
  type: string;
  description: string;
  category: string;
  subcategory: string;
  account: string;
  toAccount: string;
  card: string;
  loan: string;
  installments: number | null;
  method: string;
  amount: number;
  tags: string;
  notes: string;
}

export function toExportRow(t: ExportTransaction): ExportRow {
  const method = deriveMethod(t.type, t.paymentMethod, t.account?.type ?? null);
  return {
    date: t.date,
    type: EXPORT_TYPE_LABELS[t.type],
    description: t.description ?? '',
    category: t.category ? (t.category.parent?.name ?? t.category.name) : '',
    subcategory: t.category?.parent ? t.category.name : '',
    account: t.account?.name ?? '',
    toAccount: t.toAccount?.name ?? '',
    card: t.creditCard?.name ?? '',
    loan: t.debt?.name ?? '',
    installments: t.installments,
    method: method ? DERIVED_METHOD_LABELS[method] : '',
    amount: t.amount,
    tags: t.tags.join(', '),
    notes: t.notes ?? '',
  };
}

/**
 * Spec Fase 3 §4: un texto que empieza con `=`, `+`, `-`, `@`, tabulador o retorno de carro se
 * escribe con `'` delante, para que una hoja de cálculo nunca lo ejecute como fórmula.
 */
export function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
