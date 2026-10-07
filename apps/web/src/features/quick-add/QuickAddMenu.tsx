import { ArrowLeftRight, CreditCard, Landmark, Minus, Plus, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { QuickAddKind } from './QuickAddContext';

interface Option {
  kind: QuickAddKind;
  label: string;
  hint: string;
  icon: ReactNode;
  tone: string;
}

const OPTIONS: Option[] = [
  {
    kind: 'expense',
    label: 'Gasto',
    hint: 'Con efectivo, cuenta o tarjeta',
    icon: <Minus />,
    tone: 'bg-negative/10 text-negative',
  },
  {
    kind: 'income',
    label: 'Ingreso',
    hint: 'Salario, ventas, extras',
    icon: <Plus />,
    tone: 'bg-positive/10 text-positive',
  },
  {
    kind: 'transfer',
    label: 'Transferencia',
    hint: 'Entre tus cuentas o a ahorro',
    icon: <ArrowLeftRight />,
    tone: 'bg-surface-2 text-fg',
  },
  {
    kind: 'card-purchase',
    label: 'Compra con tarjeta',
    hint: 'Aumenta la deuda, no tu cuenta',
    icon: <CreditCard />,
    tone: 'bg-surface-2 text-fg',
  },
  {
    kind: 'card-payment',
    label: 'Pagar tarjeta',
    hint: 'No es un gasto nuevo',
    icon: <Receipt />,
    tone: 'bg-surface-2 text-fg',
  },
  {
    kind: 'loan-payment',
    label: 'Pagar préstamo',
    hint: 'Capital e intereses',
    icon: <Landmark />,
    tone: 'bg-surface-2 text-fg',
  },
];

export function QuickAddMenu({
  onPick,
  hasDebts,
}: {
  onPick: (kind: QuickAddKind) => void;
  hasDebts: boolean;
}) {
  return (
    <ul className="grid gap-2">
      {OPTIONS.filter((o) => o.kind !== 'loan-payment' || hasDebts).map((o) => (
        <li key={o.kind}>
          <button
            type="button"
            onClick={() => onPick(o.kind)}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 text-left active:scale-[.99]"
          >
            <span className={cn('flex size-10 items-center justify-center rounded-full', o.tone)}>
              {o.icon}
            </span>
            <span>
              <span className="block font-medium">{o.label}</span>
              <span className="block text-xs text-muted">{o.hint}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
