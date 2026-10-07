import type { DashboardDTO } from '@finanzas/shared';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Card } from '../../components/ui/Card';
import { AvailableSheet } from './AvailableSheet';

export function MoneySummaryCard({ data }: { data: DashboardDTO }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <p className="text-sm text-muted">Dinero total</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight">
        <Amount value={data.money.total} tone="balance" />
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-surface-2 p-3 text-left"
        >
          <span className="flex items-center justify-between text-xs text-muted">
            Disponible estimado <ChevronRight size={14} aria-hidden />
          </span>
          <Amount
            value={data.available.total}
            tone="balance"
            className="mt-1 block text-lg font-semibold"
          />
        </button>
        <div className="rounded-xl bg-surface-2 p-3">
          <span className="text-xs text-muted">Deudas</span>
          <Amount
            value={data.debts.total}
            tone={data.debts.total > 0 ? 'debt' : 'neutral'}
            className="mt-1 block text-lg font-semibold"
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Patrimonio neto aproximado:{' '}
        <span className="text-fg">
          <Amount value={data.netWorth} tone="balance" className="font-medium" />
        </span>
      </p>
      <AvailableSheet
        open={open}
        onOpenChange={setOpen}
        total={data.available.total}
        breakdown={data.available.breakdown}
      />
    </Card>
  );
}
