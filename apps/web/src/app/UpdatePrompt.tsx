import { RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../components/ui/Button';
import { reloadPage } from '../lib/reload';

/**
 * Spec Fase 3 §6: aviso fijo "Nueva versión disponible". La app nunca se recarga sola: solo cuando
 * el usuario toca "Actualizar" en esta pestaña. Si otra pestaña activa la versión nueva, esta sigue
 * igual (con el aviso) hasta que el usuario lo decida. AppLayout la carga con React.lazy para que el
 * registro del service worker quede fuera del chunk de entrada.
 */
export function UpdatePrompt() {
  const userAsked = useRef(false);
  const takenOver = useRef(false);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, reg) => {
      registration.current = reg;
    },
    onNeedReload: () => {
      if (userAsked.current) reloadPage();
      else takenOver.current = true;
    },
  });

  // Busca una versión nueva cada vez que la app vuelve a estar visible.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void registration.current?.update().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-border lg:bottom-6 print:hidden"
    >
      <p className="text-sm font-medium">Nueva versión disponible</p>
      <Button
        size="sm"
        onClick={() => {
          userAsked.current = true;
          if (takenOver.current) reloadPage();
          else void updateServiceWorker(true);
        }}
      >
        <RefreshCw size={16} aria-hidden /> Actualizar
      </Button>
    </div>
  );
}
