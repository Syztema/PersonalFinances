import { ACCOUNT_TYPE_LABELS, isLiquidAccount, type AccountDTO } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { DeletedSection } from '../../components/ui/DeletedSection';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { Icon } from '../../lib/icons';
import { useAccounts } from '../../lib/queries';
import { useRestore } from '../../lib/useRestore';
import { AccountFormSheet } from './AccountFormSheet';
import { AdjustBalanceSheet } from './AdjustBalanceSheet';

function AccountList({
  title,
  accounts,
  onSelect,
}: {
  title: string;
  accounts: AccountDTO[];
  onSelect: (a: AccountDTO) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <section>
      <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {accounts.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onSelect(a)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
            >
              <span
                className="flex size-10 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: a.color }}
              >
                <Icon name={a.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="block text-xs text-muted">
                  {[ACCOUNT_TYPE_LABELS[a.type], a.institution].filter(Boolean).join(' · ')}
                </span>
              </span>
              <Amount value={a.balance} tone="balance" className="font-semibold" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AccountsPage() {
  const accounts = useAccounts();
  const [editing, setEditing] = useState<AccountDTO | undefined>();
  const [open, setOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<AccountDTO | null>(null);
  const { restore, isRestoring } = useRestore(
    (id) => `/accounts/${id}/restore`,
    'Cuenta restaurada',
  );
  const openForm = (a?: AccountDTO) => {
    setEditing(a);
    setOpen(true);
  };

  if (accounts.isPending) return <PageSpinner />;
  if (accounts.isError)
    return <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;
  const active = accounts.data.filter((a) => a.isActive);
  const total = active.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mis cuentas</h1>
        <Button size="sm" onClick={() => openForm()} aria-label="Nueva cuenta">
          <Plus size={16} /> Nueva
        </Button>
      </div>
      {active.length === 0 ? (
        <EmptyState
          title="Aún no tienes cuentas"
          description="Agrega efectivo, bancos, billeteras como Nequi o Daviplata, y tus cuentas de ahorro."
        />
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl bg-surface p-4 ring-1 ring-border">
            <span className="font-medium">Dinero total</span>
            <Amount value={total} tone="balance" className="text-lg font-semibold" />
          </div>
          <AccountList
            title="Disponibles"
            accounts={active.filter((a) => isLiquidAccount(a.type))}
            onSelect={openForm}
          />
          <AccountList
            title="Ahorro e inversión"
            accounts={active.filter((a) => !isLiquidAccount(a.type))}
            onSelect={openForm}
          />
        </>
      )}
      <DeletedSection
        items={accounts.data.filter((a) => !a.isActive)}
        isRestoring={isRestoring}
        onRestore={(a) => restore(a.id)}
      />
      <AccountFormSheet
        open={open}
        onOpenChange={setOpen}
        account={editing}
        onAdjust={(a) => {
          setOpen(false);
          setAdjusting(a);
        }}
      />
      <AdjustBalanceSheet account={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}
