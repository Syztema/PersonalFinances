import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            value === o.value
              ? 'border-primary bg-primary/10 font-medium text-primary'
              : 'border-border bg-surface text-fg',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
