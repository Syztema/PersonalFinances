import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { useOnline } from '../../lib/useOnline';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:opacity-90',
  secondary: 'bg-surface-2 text-fg hover:bg-border',
  ghost: 'bg-transparent text-fg hover:bg-surface-2',
  danger: 'bg-negative text-negative-fg hover:opacity-90',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  /** Spec Fase 3 §6: se deshabilita sin red. Por defecto, solo los de envío (`type="submit"`). */
  requiresNetwork?: boolean;
}

/** Un botón nunca se imprime (`print:hidden`, spec Fase 3 §5.3). */
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  requiresNetwork,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const online = useOnline();
  const offline = (requiresNetwork ?? props.type === 'submit') && !online;
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading || offline}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary print:hidden',
        VARIANTS[variant],
        size === 'sm' && 'min-h-11 px-3 text-sm',
        size === 'lg' && 'min-h-12 w-full text-base',
        className,
      )}
    >
      {/* El ícono va directo (no <Spinner>): Spinner.tsx importa OfflineState, que usa Button. */}
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
