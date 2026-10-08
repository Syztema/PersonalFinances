import { useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

/**
 * Pantalla sin datos y sin red: su consulta quedó en pausa y se reanuda sola cuando vuelve la conexión.
 * Sin `onRetry`, "Reintentar" vuelve a pedir las consultas activas.
 */
export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  const queryClient = useQueryClient();
  const [retried, setRetried] = useState(false);
  return (
    <EmptyState
      icon={<WifiOff />}
      title="Sin conexión"
      description="Revisa tu internet. Cuando vuelva la red, la información se carga sola."
      action={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              setRetried(true);
              (onRetry ?? (() => void queryClient.refetchQueries({ type: 'active' })))();
            }}
          >
            Reintentar
          </Button>
          {/* Sin red las consultas siguen en pausa: el toque no cambia nada visible, así que se avisa. */}
          <p role="status" className="mt-2 text-sm text-muted">
            {retried ? 'Sigue sin conexión' : ''}
          </p>
        </>
      }
    />
  );
}
