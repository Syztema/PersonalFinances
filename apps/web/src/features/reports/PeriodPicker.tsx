import {
  REPORT_PRESET_LABELS,
  REPORT_PRESETS,
  type IsoDate,
  type ReportPeriodInput,
} from '@finanzas/shared';
import { CalendarRange } from 'lucide-react';
import { useState } from 'react';
import { Chips } from '../../components/ui/Chips';
import { cn } from '../../lib/cn';
import { CustomPeriodSheet } from './CustomPeriodSheet';

/** Spec Fase 3 §5.1: Este mes, Mes anterior, 3 meses, 6 meses, 1 año y Personalizado. */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: ReportPeriodInput;
  onChange: (period: ReportPeriodInput) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const custom: { from: IsoDate; to: IsoDate } | null = 'preset' in value ? null : value;
  return (
    <div className="space-y-2">
      <Chips
        ariaLabel="Periodo del reporte"
        value={'preset' in value ? value.preset : null}
        onChange={(preset) => onChange({ preset })}
        options={REPORT_PRESETS.map((preset) => ({
          value: preset,
          label: REPORT_PRESET_LABELS[preset],
        }))}
      />
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setCustomOpen(true)}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          custom
            ? 'border-primary bg-primary font-medium text-primary-fg'
            : 'border-border bg-surface text-fg',
        )}
      >
        <CalendarRange size={16} aria-hidden />
        Personalizado
      </button>
      <CustomPeriodSheet
        open={customOpen}
        onOpenChange={setCustomOpen}
        initial={custom}
        onApply={(period) => {
          setCustomOpen(false);
          onChange(period);
        }}
      />
    </div>
  );
}
