import { formatCOP, TRANSACTION_TYPE_LABELS, type TransactionDTO } from '@finanzas/shared';
import type { AmountTone } from '../../components/ui/Amount';
import { refName } from '../../lib/refs';

export interface Described {
  title: string;
  subtitle: string;
  tone: AmountTone;
  icon: string;
  color: string;
  /** true si el fondo es un token del tema (hay que usar un primer plano del tema); false si lo eligió el usuario. */
  colorIsToken: boolean;
  typeLabel: string;
}

const join = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join(' · ');

export function describeTransaction(t: TransactionDTO): Described {
  const category = refName(t.category);
  const account = refName(t.account);
  const toAccount = refName(t.toAccount);
  const card = refName(t.creditCard);
  const debt = refName(t.debt, '(eliminado)');
  const typeLabel = TRANSACTION_TYPE_LABELS[t.type];
  switch (t.type) {
    // Si no hay descripción, la categoría ya es el título y no se repite en el subtítulo.
    case 'INCOME':
      return {
        title: t.description ?? category ?? typeLabel,
        subtitle: join(t.description ? category : null, account),
        tone: 'income',
        icon: t.category?.icon ?? 'circle-plus',
        color: t.category?.color ?? 'var(--positive)',
        colorIsToken: !t.category?.color,
        typeLabel,
      };
    case 'EXPENSE':
      return {
        title: t.description ?? category ?? typeLabel,
        subtitle: join(
          t.parentId ? 'Intereses de préstamo' : t.description ? category : null,
          account,
        ),
        tone: 'expense',
        icon: t.category?.icon ?? 'receipt',
        color: t.category?.color ?? 'var(--negative)',
        colorIsToken: !t.category?.color,
        typeLabel,
      };
    case 'CARD_PURCHASE':
      return {
        title: t.description ?? category ?? typeLabel,
        subtitle: join(
          t.description ? category : null,
          card,
          (t.installments ?? 1) > 1 && `${t.installments} cuotas`,
        ),
        tone: 'expense',
        icon: t.category?.icon ?? 'credit-card',
        color: t.category?.color ?? 'var(--negative)',
        colorIsToken: !t.category?.color,
        typeLabel,
      };
    case 'TRANSFER':
      return {
        title: t.description ?? 'Transferencia',
        subtitle: `${account ?? '?'} → ${toAccount ?? '?'}`,
        tone: 'neutral',
        icon: 'arrow-left-right',
        color: 'var(--muted)',
        colorIsToken: true,
        typeLabel,
      };
    case 'CARD_PAYMENT':
      return {
        title: 'Pago tarjeta',
        subtitle: `${account ?? '?'} → ${card ?? '?'}`,
        tone: 'neutral',
        icon: 'credit-card',
        color: 'var(--muted)',
        colorIsToken: true,
        typeLabel,
      };
    case 'DEBT_PAYMENT':
      return {
        title: 'Pago préstamo',
        subtitle: join(
          `${account ?? '?'} → ${debt ?? '?'}`,
          t.interest > 0 && `+ intereses ${formatCOP(t.interest)}`,
        ),
        tone: 'neutral',
        icon: 'landmark',
        color: 'var(--muted)',
        colorIsToken: true,
        typeLabel,
      };
    case 'DEBT_DISBURSEMENT':
      return {
        title: 'Desembolso de préstamo',
        subtitle: `${debt ?? '?'} → ${account ?? '?'}`,
        tone: 'neutral',
        icon: 'landmark',
        color: 'var(--muted)',
        colorIsToken: true,
        typeLabel,
      };
  }
}
