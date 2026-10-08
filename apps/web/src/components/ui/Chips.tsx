import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/** Índice de destino para las teclas de un grupo de opción (patrón radiogroup de WAI-ARIA). */
function targetIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Grupo de opción: un solo tope de tabulación (la opción elegida) y flechas, Inicio y Fin. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Deshabilita todas las opciones (por ejemplo, sin red); tampoco hay selección con teclado. */
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 ? selected : 0;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (disabled) return;
    const next = targetIndex(event.key, index, options.length);
    const option = next === null ? undefined : options[next];
    if (next === null || !option) return;
    event.preventDefault();
    refs.current[next]?.focus();
    if (option.value !== value) onChange(option.value);
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          disabled={disabled}
          aria-checked={value === o.value}
          tabIndex={i === tabStop ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(event) => onKeyDown(event, i)}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            value === o.value
              ? 'border-primary bg-primary font-medium text-primary-fg'
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
