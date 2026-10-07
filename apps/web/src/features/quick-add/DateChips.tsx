import { addDays, type IsoDate } from '@finanzas/shared';
import { Chips } from '../../components/ui/Chips';
import { TextInput } from '../../components/ui/Field';

export function DateChips({
  value,
  onChange,
  today,
}: {
  value: IsoDate;
  onChange: (d: IsoDate) => void;
  today: IsoDate;
}) {
  const yesterday = addDays(today, -1);
  const choice = value === today ? 'today' : value === yesterday ? 'yesterday' : 'other';
  return (
    <div className="space-y-2">
      <Chips
        ariaLabel="Fecha"
        value={choice}
        onChange={(c) =>
          onChange(c === 'today' ? today : c === 'yesterday' ? yesterday : addDays(today, -2))
        }
        options={[
          { value: 'today', label: 'Hoy' },
          { value: 'yesterday', label: 'Ayer' },
          { value: 'other', label: 'Otra' },
        ]}
      />
      {choice === 'other' && (
        <TextInput
          type="date"
          aria-label="Fecha del movimiento"
          max={today}
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      )}
    </div>
  );
}
