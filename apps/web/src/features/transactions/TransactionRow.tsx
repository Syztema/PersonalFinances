import type { TransactionDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Icon } from '../../lib/icons';
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
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: d.color }}
      >
        <Icon name={d.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{d.title}</span>
        <span className="block truncate text-xs text-muted">{d.subtitle}</span>
      </span>
      <Amount value={transaction.amount} tone={d.tone} className="shrink-0 font-semibold" />
    </button>
  );
}
