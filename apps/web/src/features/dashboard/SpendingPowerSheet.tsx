import type { BreakdownItem, SpendingPowerDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Sheet } from '../../components/ui/Sheet';
import { formatCOP, formatShortDate } from '../../lib/format';

function Items({ items }: { items: BreakdownItem[] }) {
  return (
    <ul className="divide-y divide-border">
      {items
        .filter((i) => i.amount !== 0)
        .map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{i.label}</span>
            <Amount
              value={i.amount}
              tone={i.amount < 0 ? 'expense' : 'neutral'}
              className="font-medium"
            />
          </li>
        ))}
    </ul>
  );
}

/** Spec 8.7: desglose del límite por liquidez y, si hay presupuesto, del límite por presupuesto. */
export function SpendingPowerSheet({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: SpendingPowerDTO;
}) {
  const { liquidity, budget } = data.breakdown;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="¿Cómo se calcula?"
      description="Lo que puedes gastar hoy sin quedarte corto para lo que viene este mes."
    >
      <div className="space-y-4">
        <section>
          <h3 className="text-sm font-semibold">Según tu dinero y tus próximos pagos</h3>
          <Items items={liquidity.items} />
          <p className="mt-1 text-sm text-muted">
            Hasta el {formatShortDate(liquidity.bindingDate)} ({liquidity.days}{' '}
            {liquidity.days === 1 ? 'día' : 'días'}): {formatCOP(liquidity.daily)} por día
          </p>
        </section>
        {budget && (
          <section>
            <h3 className="text-sm font-semibold">Según tu presupuesto</h3>
            <Items items={budget.items} />
            <p className="mt-1 text-sm text-muted">
              {budget.days} {budget.days === 1 ? 'día' : 'días'} restantes:{' '}
              {formatCOP(budget.daily)} por día
            </p>
          </section>
        )}
        <div className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
          <p>
            {budget ? 'Se usa el menor' : 'Resultado'}: <strong>{formatCOP(data.daily)}</strong> por
            día. Lo que gastes hoy no cambia esta cifra; se descuenta de "Te quedan hoy".
          </p>
          <p>No incluye pagos de obligaciones programadas ni ajustes de saldo.</p>
        </div>
        <p className="text-xs text-muted">
          Es una estimación basada en tus datos, no asesoría financiera.
        </p>
      </div>
    </Sheet>
  );
}
