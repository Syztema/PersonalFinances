import type { CardStatementDTO, Page, TransactionDTO } from '@finanzas/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatShortDate } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useRestore } from '../../lib/useRestore';
import { useQuickAdd } from '../quick-add/QuickAddContext';
import { TransactionDetailSheet } from '../transactions/TransactionDetailSheet';
import { TransactionRow } from '../transactions/TransactionRow';
import { CardFormSheet } from './CardFormSheet';

export function CardDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { open } = useQuickAdd();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<TransactionDTO | null>(null);
  const { restore, isRestoring } = useRestore(
    (cardId) => `/credit-cards/${cardId}/restore`,
    'Tarjeta restaurada',
  );
  const statement = useQuery({
    queryKey: [...qk.cards, id, 'statement'],
    queryFn: () => api.get<CardStatementDTO>(`/credit-cards/${id}/statement`),
  });
  const movements = useQuery({
    queryKey: [...qk.transactions, 'card', id],
    queryFn: () => api.get<Page<TransactionDTO>>(`/transactions?creditCardId=${id}&limit=20`),
  });

  if (statement.isPending) return <PageSpinner />;
  if (statement.isError)
    return <ErrorState error={statement.error} onRetry={() => void statement.refetch()} />;
  const { card, upcoming } = statement.data;

  return (
    <div className="space-y-4">
      <Link to="/cards" className="inline-flex items-center gap-1 text-sm text-primary">
        <ArrowLeft size={16} /> Tarjetas
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{card.name}</h1>
        {card.isActive && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>
      {!card.isActive && (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Esta tarjeta fue eliminada. Su historial se conserva.
          </p>
          <Button
            size="sm"
            requiresNetwork
            loading={isRestoring(card.id)}
            onClick={() => restore(card.id)}
          >
            Restaurar
          </Button>
        </Card>
      )}
      <Card>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted">Cupo</dt>
            <dd className="font-semibold">
              <Amount value={card.creditLimit} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{card.debt < 0 ? 'Saldo a favor' : 'Deuda'}</dt>
            <dd className="font-semibold">
              <Amount value={Math.abs(card.debt)} tone={card.debt > 0 ? 'debt' : 'neutral'} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">Disponible</dt>
            <dd className="font-semibold">
              <Amount value={card.available} />
            </dd>
          </div>
        </dl>
        <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
          <p>
            Pago del mes: <Amount value={card.amountDue} className="font-semibold" />{' '}
            {card.amountDue > 0 && (
              <span className={card.isOverdue ? 'text-negative' : 'text-muted'}>
                {card.isOverdue ? 'vencido' : 'vence'} {formatShortDate(card.dueDate)}
              </span>
            )}
          </p>
          <p className="mt-1 text-muted">
            Corte: {formatShortDate(card.lastCutoff)} · próximo corte{' '}
            {formatShortDate(card.nextCutoff)} (pago {formatShortDate(card.nextDueDate)})
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            disabled={!card.isActive || card.debt <= 0}
            onClick={() => open({ kind: 'card-payment', cardId: card.id })}
          >
            Pagar tarjeta
          </Button>
          <Button
            variant="secondary"
            disabled={!card.isActive}
            onClick={() => open({ kind: 'card-purchase', cardId: card.id })}
          >
            Registrar compra
          </Button>
        </div>
      </Card>

      {upcoming.length > 0 && (
        <Card>
          <CardTitle>Cuotas próximas</CardTitle>
          <ul className="mt-2 divide-y divide-border text-sm">
            {upcoming.map((u) => (
              <li key={u.cutoff} className="flex justify-between py-2">
                <span>
                  Corte {formatShortDate(u.cutoff)} · paga {formatShortDate(u.dueDate)}
                </span>
                <Amount value={u.amount} className="font-medium" />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Estimado sin intereses. Lo que cobre el banco regístralo como compra en "Intereses y
            comisiones".
          </p>
        </Card>
      )}

      <section>
        <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase">
          Movimientos recientes
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          {(movements.data?.items ?? []).map((t) => (
            <li key={t.id}>
              <TransactionRow transaction={t} onSelect={setSelected} />
            </li>
          ))}
          {movements.data?.items.length === 0 && (
            <li className="p-4 text-sm text-muted">Sin movimientos todavía.</li>
          )}
        </ul>
      </section>

      <CardFormSheet
        open={editing}
        onOpenChange={setEditing}
        card={card}
        onDeleted={() => navigate('/cards', { replace: true })}
      />
      <TransactionDetailSheet transaction={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
