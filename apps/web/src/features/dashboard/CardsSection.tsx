import type { CreditCardDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { CardTitle } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import { formatShortDate } from '../../lib/format';
import { useQuickAdd } from '../quick-add/QuickAddContext';

export function CardsSection({ cards }: { cards: CreditCardDTO[] }) {
  const { open } = useQuickAdd();
  if (cards.length === 0) return null;
  return (
    <section>
      <CardTitle className="mb-2 px-1">Tarjetas</CardTitle>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {cards.map((c) => (
          <li
            key={c.id}
            className="w-[85%] max-w-sm shrink-0 snap-start rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{c.name}</span>
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted">Cupo</dt>
                <dd className="font-medium">
                  <Amount value={c.creditLimit} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">{c.debt < 0 ? 'Saldo a favor' : 'Utilizado'}</dt>
                <dd className="font-medium">
                  <Amount value={Math.abs(c.debt)} tone={c.debt > 0 ? 'debt' : 'neutral'} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Disponible</dt>
                <dd className="font-medium">
                  <Amount value={c.available} />
                </dd>
              </div>
            </dl>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div
                className={cn(
                  'h-full rounded-full',
                  c.utilization >= 0.8 ? 'bg-negative' : 'bg-primary',
                )}
                style={{ width: `${Math.min(100, Math.round(c.utilization * 100))}%` }}
              />
            </div>
            <p className="mt-3 text-sm">
              {c.amountDue > 0 ? (
                <>
                  Pago del mes: <Amount value={c.amountDue} className="font-semibold" />{' '}
                  <span
                    className={cn(
                      'text-xs',
                      c.isOverdue ? 'font-medium text-negative' : 'text-muted',
                    )}
                  >
                    {c.isOverdue
                      ? `vencido desde ${formatShortDate(c.dueDate)}`
                      : `vence ${formatShortDate(c.dueDate)}`}
                  </span>
                </>
              ) : c.committed > 0 ? (
                <>
                  Próximo pago estimado: <Amount value={c.committed} className="font-semibold" />{' '}
                  <span className="text-xs text-muted">{formatShortDate(c.nextDueDate)}</span>
                </>
              ) : (
                <span className="text-muted">Sin pagos pendientes</span>
              )}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3 w-full"
              aria-label={`Pagar tarjeta ${c.name}`}
              disabled={c.debt <= 0}
              onClick={() => open({ kind: 'card-payment', cardId: c.id })}
            >
              Pagar tarjeta
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
