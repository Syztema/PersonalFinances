import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useOnline } from '../../lib/useOnline';
import { OfflineState } from './OfflineState';

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-5 animate-spin', className)} aria-hidden />;
}

export function PageSpinner() {
  const online = useOnline();
  // Spec Fase 3 §6: sin red, una consulta sin datos queda en pausa; se explica en vez de girar.
  if (!online) return <OfflineState />;
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center text-muted"
      role="status"
      aria-label="Cargando"
    >
      <Spinner className="size-7" />
    </div>
  );
}
