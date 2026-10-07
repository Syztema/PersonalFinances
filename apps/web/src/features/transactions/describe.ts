import { formatCOP, TRANSACTION_TYPE_LABELS, type TransactionDTO } from '@finanzas/shared';
import type { AmountTone } from '../../components/ui/Amount';

export interface Described {
  title: string;
  subtitle: string;
  tone: AmountTone;
  icon: string;
  color: string;
  typeLabel: string;
}

const join = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join(' · ');

export function describeTransaction(t: TransactionDTO): Described {
  const category = t.category?.name;
  const typeLabel = TRANSACTION_TYPE_LABELS[t.type];
  switch (t.type) {
    // Si no hay descripción, la categoría ya es el título y no se repite en el subtítulo.
    case 'INCOME':
      return {
        title: t.description ?? category ?? typeLabel,
        subtitle: join(t.description ? category : null, t.account?.name),
        tone: 'income',
        icon: t.category?.icon ?? 'circle-plus',
        color: t.category?.color ?? '#15803d',
        typeLabel,
      };
    case 'EXPENSE':
      return {
        title: t.description ?? category ?? typeLabel,
        subtitle: join(
          t.parentId ? 'Intereses de préstamo' : t.description ? category : null,
          t.account?.name,
        ),
        tone: 'expense',
        icon: t.category?.icon ?? 'receipt',
        color: t.category?.color ?? '#be123c',
        typeLabel,
      };
    case 'CARD_PURCHASE':
      return {
        title: t.description ?? category ?? typeLabel,
        subtitle: join(
          t.description ? category : null,
          t.creditCard?.name,
          (t.installments ?? 1) > 1 && `${t.installments} cuotas`,
        ),
        tone: 'expense',
        icon: t.category?.icon ?? 'credit-card',
        color: t.category?.color ?? '#be123c',
        typeLabel,
      };
    case 'TRANSFER':
      return {
        title: t.description ?? 'Transferencia',
        subtitle: `${t.account?.name ?? '?'} → ${t.toAccount?.name ?? '?'}`,
        tone: 'neutral',
        icon: 'arrow-left-right',
        color: '#64748b',
        typeLabel,
      };
    case 'CARD_PAYMENT':
      return {
        title: 'Pago tarjeta',
        subtitle: `${t.account?.name ?? '?'} → ${t.creditCard?.name ?? '?'}`,
        tone: 'neutral',
        icon: 'credit-card',
        color: '#64748b',
        typeLabel,
      };
    case 'DEBT_PAYMENT':
      return {
        title: 'Pago préstamo',
        subtitle: join(
          `${t.account?.name ?? '?'} → ${t.debt?.name ?? '?'}`,
          t.interest > 0 && `+ intereses ${formatCOP(t.interest)}`,
        ),
        tone: 'neutral',
        icon: 'landmark',
        color: '#64748b',
        typeLabel,
      };
    case 'DEBT_DISBURSEMENT':
      return {
        title: 'Desembolso de préstamo',
        subtitle: `${t.debt?.name ?? '?'} → ${t.account?.name ?? '?'}`,
        tone: 'neutral',
        icon: 'landmark',
        color: '#64748b',
        typeLabel,
      };
  }
}
