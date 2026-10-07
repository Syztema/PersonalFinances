import { TriangleAlert } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

export function RouteError() {
  return (
    <div className="mx-auto max-w-md p-6">
      <EmptyState
        icon={<TriangleAlert />}
        title="No pudimos cargar esta pantalla. Puede que haya una versión nueva."
        action={<Button onClick={() => window.location.reload()}>Recargar</Button>}
      />
    </div>
  );
}
