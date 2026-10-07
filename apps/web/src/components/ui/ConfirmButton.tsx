import { useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps } from './Button';

const MIN_CONFIRM_DELAY_MS = 400;

/** Pide un segundo toque antes de ejecutar acciones destructivas. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = '¿Seguro? Toca de nuevo',
  ...props
}: ButtonProps & { onConfirm: () => void; confirmLabel?: string }) {
  const [armed, setArmed] = useState(false);
  const armedAt = useRef(0);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      variant="danger"
      {...props}
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
  );
}
