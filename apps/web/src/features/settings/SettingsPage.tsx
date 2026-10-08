import { formatCOP, type FinancialSettingsResponse } from '@finanzas/shared';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/EmptyState';
import { Field, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { monthLabel } from '../../lib/format';
import { useFinancialSettings } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';

type PctKey = 'obligationsPct' | 'savingsPct' | 'investmentPct' | 'leisurePct' | 'otherPct';

const PCT_FIELDS: Array<{ key: PctKey; label: string; hint: string }> = [
  { key: 'obligationsPct', label: 'Obligaciones', hint: 'Vivienda, servicios, transporte, salud' },
  { key: 'savingsPct', label: 'Ahorro', hint: 'Lo que transfieres a cuentas de ahorro' },
  { key: 'investmentPct', label: 'Inversión', hint: 'Lo que transfieres a cuentas de inversión' },
  { key: 'leisurePct', label: 'Entretenimiento', hint: 'Salidas, suscripciones, gustos' },
  { key: 'otherPct', label: 'Otros', hint: 'Lo demás' },
];

export function SettingsPage() {
  const settings = useFinancialSettings();
  if (settings.isPending) return <PageSpinner />;
  if (settings.isError)
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  return <SettingsForm data={settings.data} />;
}

function SettingsForm({ data }: { data: FinancialSettingsResponse }) {
  const [pcts, setPcts] = useState<Record<PctKey, string>>(
    () =>
      Object.fromEntries(PCT_FIELDS.map((f) => [f.key, String(data.settings[f.key])])) as Record<
        PctKey,
        string
      >,
  );
  const [estimate, setEstimate] = useState<number | null>(data.settings.monthlyIncomeEstimate);
  const [threshold, setThreshold] = useState<number | null>(data.settings.lowBalanceThreshold);
  const [error, setError] = useState<string | null>(null);
  const save = useCrudMutation(
    (body: Record<string, unknown>) => api.put('/settings/financial', body),
    'Configuración guardada',
  );
  const values = Object.fromEntries(
    PCT_FIELDS.map((f) => [f.key, Number(pcts[f.key] || 0)]),
  ) as Record<PctKey, number>;
  const total = PCT_FIELDS.reduce((s, f) => s + values[f.key], 0);
  const income = data.month.projectedIncome;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <Card>
        <CardTitle>Cómo repartir tu ingreso</CardTitle>
        <p className="mt-1 text-sm text-muted">
          Ingreso proyectado de {monthLabel(data.month.key)}:{' '}
          <Amount value={income} className="text-fg" />
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate(
              {
                ...values,
                monthlyIncomeEstimate: estimate || null,
                lowBalanceThreshold: threshold ?? 0,
              },
              { onError: (err) => setError(err.fields?.total ?? err.message) },
            );
          }}
        >
          {PCT_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={`${f.label} (%)`}
              htmlFor={`pct-${f.key}`}
              hint={`${f.hint}. ≈ ${formatCOP(Math.round((income * values[f.key]) / 100))} al mes.`}
            >
              <TextInput
                id={`pct-${f.key}`}
                inputMode="numeric"
                value={pcts[f.key]}
                onChange={(e) =>
                  setPcts((p) => ({ ...p, [f.key]: e.target.value.replace(/\D/g, '').slice(0, 3) }))
                }
              />
            </Field>
          ))}
          <p
            role="status"
            className={cn('text-sm font-medium', total === 100 ? 'text-positive' : 'text-negative')}
          >
            {total === 100 ? 'Total: 100 %' : `Total: ${total} % — deben sumar 100 %`}
          </p>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <Field
            label="Ingreso mensual estimado (opcional)"
            htmlFor="income-estimate"
            hint="Se usa cuando aún no registras ingresos del mes."
          >
            <MoneyInput id="income-estimate" value={estimate} onChange={setEstimate} />
          </Field>
          <Field
            label="Avisarme si mi disponible baja de"
            htmlFor="low-balance"
            hint="Con 0 solo se avisa si el disponible queda en negativo."
          >
            <MoneyInput id="low-balance" value={threshold} onChange={setThreshold} />
          </Field>
          <Button type="submit" size="lg" disabled={total !== 100} loading={save.isPending}>
            Guardar configuración
          </Button>
        </form>
      </Card>
      <Card>
        <CardTitle>Este mes: objetivo vs. real</CardTitle>
        <ul className="mt-3 space-y-3">
          {data.month.buckets.map((b) => (
            <li key={b.key} className="space-y-1">
              <div className="flex justify-between gap-2 text-sm">
                <span>
                  {b.label} · {b.pct} %
                </span>
                <span>
                  <Amount value={b.actual} /> de <Amount value={b.target} />
                </span>
              </div>
              <ProgressBar
                value={b.target > 0 ? b.actual / b.target : 0}
                label={b.label}
                tone={
                  b.key === 'SAVINGS' || b.key === 'INVESTMENT'
                    ? 'positive'
                    : b.key === 'OBLIGATIONS'
                      ? 'neutral'
                      : 'auto'
                }
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
