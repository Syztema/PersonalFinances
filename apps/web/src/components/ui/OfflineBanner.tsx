import { WifiOff } from 'lucide-react';
import { useOnline } from '../../lib/useOnline';

/** Spec Fase 3 §6: franja fija mientras no hay red. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex min-h-11 items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm font-medium text-warning-fg print:hidden"
    >
      <WifiOff size={16} aria-hidden />
      Sin conexión — no se puede guardar hasta que vuelva la red
    </div>
  );
}
