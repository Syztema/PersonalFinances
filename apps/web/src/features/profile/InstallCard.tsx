import { Download } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { useInstallPrompt } from '../../lib/installPrompt';

/** Spec Fase 3 §6: "Instalar Finanzas" o la instrucción de Safari; nada si ya corre instalada. */
export function InstallCard() {
  const { canInstall, install, isIos, isStandalone } = useInstallPrompt();
  if (isStandalone || (!canInstall && !isIos)) return null;
  return (
    <Card>
      <CardTitle>Instalar la app</CardTitle>
      {canInstall ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">
            Abre Finanzas desde tu pantalla de inicio, como cualquier app.
          </p>
          <Button size="lg" onClick={() => void install()}>
            <Download size={18} aria-hidden /> Instalar Finanzas
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">En Safari: Compartir → Agregar a inicio</p>
      )}
    </Card>
  );
}
