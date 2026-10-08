import { resolveReportPeriod, startOfMonth, type IsoDate } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { useToday } from '../auth/useAuth';

type CustomPeriod = { from: IsoDate; to: IsoDate };

/** Panel "Personalizado" con las validaciones del spec Fase 3 §3.1 (las mismas de la API). */
export function CustomPeriodSheet({
  open,
  onOpenChange,
  initial,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CustomPeriod | null;
  onApply: (period: CustomPeriod) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Periodo personalizado"
      description="Máximo 24 meses. La fecha final no puede ser futura."
    >
      {open && <CustomPeriodForm initial={initial} onApply={onApply} />}
    </Sheet>
  );
}

function CustomPeriodForm({
  initial,
  onApply,
}: {
  initial: CustomPeriod | null;
  onApply: (period: CustomPeriod) => void;
}) {
  // "Hoy" en la zona horaria del usuario, como en el resto de pantallas.
  const today = useToday();
  const [from, setFrom] = useState<IsoDate>(initial?.from ?? startOfMonth(today));
  const [to, setTo] = useState<IsoDate>(initial?.to ?? today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Al editar una fecha se descarta su error (y el general) en lugar de dejarlo hasta el próximo envío.
  const clearError = (field: 'from' | 'to') =>
    setErrors(({ [field]: _field, _: _general, ...rest }) => rest);

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!from || !to) {
          setErrors({
            ...(!from && { from: 'Elige la fecha inicial' }),
            ...(!to && { to: 'Elige la fecha final' }),
          });
          return;
        }
        const result = resolveReportPeriod({ from, to }, today);
        if (!result.ok) {
          setErrors(result.fields);
          return;
        }
        onApply({ from, to });
      }}
    >
      <Field label="Desde" htmlFor="report-from" error={errors.from}>
        <TextInput
          id="report-from"
          type="date"
          max={today}
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            clearError('from');
          }}
        />
      </Field>
      <Field label="Hasta" htmlFor="report-to" error={errors.to}>
        <TextInput
          id="report-to"
          type="date"
          max={today}
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            clearError('to');
          }}
        />
      </Field>
      {/* Solo cambia lo que se consulta: no guarda nada, así que no exige red. */}
      <Button type="submit" size="lg" requiresNetwork={false}>
        Ver reporte
      </Button>
    </form>
  );
}
