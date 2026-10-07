import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { DeletedSection } from '../../components/ui/DeletedSection';
import { PageSpinner } from '../../components/ui/Spinner';
import { formatShortDate } from '../../lib/format';
import { useCards } from '../../lib/queries';
import { useRestore } from '../../lib/useRestore';
import { CardFormSheet } from './CardFormSheet';

export function CardsPage() {
  const cards = useCards();
  const [open, setOpen] = useState(false);
  const { restore, isRestoring } = useRestore(
    (id) => `/credit-cards/${id}/restore`,
    'Tarjeta restaurada',
  );
  if (cards.isPending) return <PageSpinner />;
  if (cards.isError) return <ErrorState error={cards.error} onRetry={() => void cards.refetch()} />;

  const active = cards.data.filter((c) => c.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tarjetas de crédito</h1>
        <Button size="sm" onClick={() => setOpen(true)} aria-label="Nueva tarjeta">
          <Plus size={16} /> Nueva
        </Button>
      </div>
      {active.length === 0 ? (
        <EmptyState
          title="Aún no tienes tarjetas"
          description="Registra tus tarjetas de crédito para controlar su deuda, cuotas y fechas de pago."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          {active.map((c) => (
            <li key={c.id}>
              <Link to={`/cards/${c.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {c.amountDue > 0
                      ? `Pago del mes vence ${formatShortDate(c.dueDate)}`
                      : 'Sin pago pendiente'}
                  </span>
                </span>
                <span className="text-right">
                  {c.debt < 0 ? (
                    <>
                      <span className="block text-xs text-positive">Saldo a favor</span>
                      <Amount value={-c.debt} className="block font-semibold" />
                    </>
                  ) : (
                    <>
                      <Amount
                        value={c.debt}
                        tone={c.debt > 0 ? 'debt' : 'neutral'}
                        className="block font-semibold"
                      />
                      <span className="text-xs text-muted">
                        de <Amount value={c.creditLimit} />
                      </span>
                    </>
                  )}
                </span>
                <ChevronRight size={18} className="text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <DeletedSection
        items={cards.data.filter((c) => !c.isActive)}
        isRestoring={isRestoring}
        onRestore={(c) => restore(c.id)}
      />
      <CardFormSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
