import { formatCOP } from '@finanzas/shared';
import { cn } from '../../lib/cn';

/**
 * income: +$X verde; expense: -$X rojo; neutral: magnitud sin color (pagos y transferencias);
 * debt: magnitud en rojo; balance: conserva el signo, rojo solo si es negativo.
 */
export type AmountTone = 'income' | 'expense' | 'neutral' | 'debt' | 'balance';

export function Amount({
  value,
  tone = 'neutral',
  className,
}: {
  value: number;
  tone?: AmountTone;
  className?: string;
}) {
  const text =
    tone === 'income'
      ? `+${formatCOP(Math.abs(value))}`
      : tone === 'expense'
        ? `-${formatCOP(Math.abs(value))}`
        : tone === 'balance'
          ? formatCOP(value)
          : formatCOP(Math.abs(value));
  return (
    <span
      className={cn(
        'tabular-nums',
        tone === 'income' && 'text-positive',
        (tone === 'expense' || tone === 'debt' || (tone === 'balance' && value < 0)) &&
          'text-negative',
        className,
      )}
    >
      {text}
    </span>
  );
}
