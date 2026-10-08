import { CircleAlert } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { reloadPage } from '../../lib/reload';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

/**
 * Final review 3B, Important 3: si el chunk diferido de los gráficos no llega (red caída, sin
 * service worker todavía o un despliegue entre la entrada y el chunk), el error se queda en esta
 * sección y el resto de la pantalla sigue. React.lazy guarda el rechazo: solo recargar lo recupera.
 */
export class ChunkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState
        icon={<CircleAlert />}
        title="No se pudieron cargar los gráficos."
        action={
          <Button variant="secondary" onClick={() => reloadPage()}>
            Recargar
          </Button>
        }
      />
    );
  }
}
