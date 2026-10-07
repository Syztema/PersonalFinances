import type { SpendingPowerDTO } from '@finanzas/shared';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Card } from '../../components/ui/Card';
import { SpendingPowerSheet } from './SpendingPowerSheet';

export function SpendingPowerCard({ data }: { data: SpendingPowerDTO }) {
  const [open, setOpen] = useState(false);
  const over = data.remainingToday < 0;
  return (
    <Card>
      <p className="text-sm text-muted">¿Cuánto puedo gastar hoy?</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight">
        <Amount value={data.daily} />
      </p>
      {data.daily === 0 && data.reason && (
        <p className="mt-1 text-sm text-negative">Hoy no tienes margen. {data.reason}</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2 p-3">
          <span className="text-xs text-muted">Gastado hoy</span>
          <Amount value={data.spentToday} className="mt-1 block font-semibold" />
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <span className="text-xs text-muted">{over ? 'Hoy te pasaste' : 'Te quedan hoy'}</span>
          <Amount
            value={Math.abs(data.remainingToday)}
            tone={over ? 'debt' : 'neutral'}
            className="mt-1 block font-semibold"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm text-primary"
      >
        ¿Cómo se calcula? <ChevronRight size={16} aria-hidden />
      </button>
      <SpendingPowerSheet open={open} onOpenChange={setOpen} data={data} />
    </Card>
  );
}
