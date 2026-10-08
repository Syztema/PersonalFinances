import { formatCOP, MAX_AMOUNT, parseCOP } from '@finanzas/shared';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { inputClass, useFieldControl } from './Field';

interface MoneyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'size'
> {
  value: number | null;
  onChange: (value: number | null) => void;
  size?: 'md' | 'lg';
}

export function MoneyInput({ value, onChange, size = 'md', className, ...props }: MoneyInputProps) {
  const link = useFieldControl(props.id);
  return (
    <input
      {...link}
      {...props}
      inputMode="numeric"
      autoComplete="off"
      placeholder={props.placeholder ?? '$0'}
      value={value == null ? '' : formatCOP(value)}
      onChange={(e) => {
        const next = parseCOP(e.target.value);
        if (next !== null && next > MAX_AMOUNT) return;
        onChange(next);
      }}
      className={cn(
        size === 'lg'
          ? 'w-full bg-transparent text-center text-4xl font-semibold tabular-nums outline-none placeholder:text-border'
          : cn(inputClass, 'tabular-nums'),
        className,
      )}
    />
  );
}
