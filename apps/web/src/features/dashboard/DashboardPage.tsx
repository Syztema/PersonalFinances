import type { DashboardDTO } from '@finanzas/shared';
import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { monthLabel } from '../../lib/format';
import { qk } from '../../lib/queries';
import { AccountsCard } from './AccountsCard';
import { CardsSection } from './CardsSection';
import { DashboardCharts } from './DashboardCharts';
import { GoalsSection } from './GoalsSection';
import { LoansSection } from './LoansSection';
import { MoneySummaryCard } from './MoneySummaryCard';
import { MonthCard } from './MonthCard';
import { SpendingPowerCard } from './SpendingPowerCard';
import { StatusCard } from './StatusCard';

export function DashboardPage() {
  const query = useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api.get<DashboardDTO>('/dashboard'),
  });
  if (query.isPending) return <PageSpinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const d = query.data;
  const isNew = d.money.accounts.length === 0 && d.cards.length === 0;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted">Resumen de {monthLabel(d.month)}</p>
        <h1 className="text-2xl font-semibold">Hola, {d.greetingName}</h1>
      </header>
      {isNew ? (
        <EmptyState
          icon={<Wallet />}
          title="Crea tu primera cuenta"
          description="Registra dónde tienes tu dinero (efectivo, Bancolombia, Nequi…) con su saldo actual. Después podrás anotar gastos e ingresos en segundos."
          action={
            <Link
              to="/accounts"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-medium text-primary-fg"
            >
              Agregar cuenta
            </Link>
          }
        />
      ) : (
        <>
          <SpendingPowerCard data={d.spendingPower} />
          <MoneySummaryCard data={d} />
          <StatusCard status={d.status} alerts={d.alerts} />
          <MonthCard data={d.thisMonth} budget={d.budget} />
          <AccountsCard accounts={d.money.accounts} total={d.money.total} />
          <CardsSection cards={d.cards} />
          <LoansSection loans={d.loans} />
          <GoalsSection goals={d.goals} />
          <DashboardCharts />
        </>
      )}
    </div>
  );
}
