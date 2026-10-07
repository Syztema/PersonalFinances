import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon, ICON_CHOICES } from '../../lib/icons';

export const COLOR_CHOICES = [
  '#0f766e',
  '#0ea5e9',
  '#6366f1',
  '#7c3aed',
  '#820ad1',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#ca8a04',
  '#16a34a',
  '#64748b',
  '#0f172a',
];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
      {COLOR_CHOICES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className="flex size-11 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: c }}
        >
          {value === c && <Check size={18} />}
        </button>
      ))}
    </div>
  );
}

export function IconPicker({ value, onChange }: { value: string; onChange: (i: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Ícono" className="flex flex-wrap gap-2">
      {ICON_CHOICES.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={name}
          onClick={() => onChange(name)}
          className={cn(
            'flex size-11 items-center justify-center rounded-xl border',
            value === name ? 'border-primary bg-primary/10 text-primary' : 'border-border',
          )}
        >
          <Icon name={name} size={18} />
        </button>
      ))}
    </div>
  );
}
