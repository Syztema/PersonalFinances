import { useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps } from './Button';

const MIN_CONFIRM_DELAY_MS = 400;

/**
 * Pide un segundo toque antes de ejecutar acciones destructivas. En el segundo paso su nombre
 * accesible es "Confirmar: <etiqueta>" y se anuncia en una región `aria-live` (spec Fase 3 §7.1).
 * Siempre requiere red (spec Fase 3 §6).
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = '¿Seguro? Toca de nuevo',
  'aria-label': ariaLabel,
  ...props
}: ButtonProps & { onConfirm: () => void; confirmLabel?: string }) {
  const [armed, setArmed] = useState(false);
  const armedAt = useRef(0);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  const label = ariaLabel ?? (typeof children === 'string' ? children : undefined);
  const armedName = label ? `Confirmar: ${label}` : confirmLabel;
  return (
    <>
      <Button
        variant="danger"
        {...props}
        requiresNetwork
        aria-label={armed ? armedName : ariaLabel}
        onClick={() => {
          if (!armed) {
            armedAt.current = Date.now();
            setArmed(true);
          } else if (Date.now() - armedAt.current >= MIN_CONFIRM_DELAY_MS) {
            setArmed(false);
            onConfirm();
          }
        }}
      >
        {armed ? confirmLabel : children}
      </Button>
      <span aria-live="polite" className="sr-only">
        {armed ? armedName : ''}
      </span>
    </>
  );
}
