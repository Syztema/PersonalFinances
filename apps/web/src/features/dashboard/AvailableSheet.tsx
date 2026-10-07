import type { BreakdownItem } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Sheet } from '../../components/ui/Sheet';

export function AvailableSheet({
  open,
  onOpenChange,
  total,
  breakdown,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  total: number;
  breakdown: BreakdownItem[];
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="¿Cómo se calcula el disponible?"
      description="Lo que tienes hoy menos lo que ya está comprometido este mes."
    >
      <ul className="divide-y divide-border">
        {breakdown.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span>{item.label}</span>
            <Amount
              value={item.amount}
              tone={item.amount < 0 ? 'expense' : 'neutral'}
              className="font-medium"
            />
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 py-3 font-semibold">
          <span>Disponible estimado</span>
          <Amount value={total} tone="balance" />
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted">
        Las cuotas futuras de compras diferidas cuentan como deuda, pero no le quitan disponible a
        este mes. Es una estimación basada en tus datos, no asesoría financiera.
      </p>
    </Sheet>
  );
}
