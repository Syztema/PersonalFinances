import type { TransactionDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { cn } from '../../lib/cn';
import { Icon } from '../../lib/icons';
import { refName } from '../../lib/refs';
import { describeTransaction } from './describe';

export function TransactionRow({
  transaction,
  onSelect,
}: {
  transaction: TransactionDTO;
  onSelect: (t: TransactionDTO) => void;
}) {
  const d = describeTransaction(transaction);
  return (
    <button
      type="button"
      onClick={() => onSelect(transaction)}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          d.colorIsToken ? 'text-surface' : 'text-white',
        )}
        style={{ backgroundColor: d.color }}
      >
        <Icon name={d.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{d.title}</span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
          {transaction.companion && (
            // Spec con quién §3.2: el ícono es parte del nombre de la fila ("Con Amigos").
            <span
              role="img"
              aria-label={`Con ${refName(transaction.companion)}`}
              className="inline-flex shrink-0"
            >
              <Icon name={transaction.companion.icon} size={12} />
            </span>
          )}
          <span className="min-w-0 truncate">{d.subtitle}</span>
        </span>
      </span>
      <Amount value={transaction.amount} tone={d.tone} className="shrink-0 font-semibold" />
    </button>
  );
}
