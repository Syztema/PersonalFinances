import type { AlertDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api, type ApiError } from '../../lib/api';
import { qk, useAlerts } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { AlertItem, StatusSummary } from './AlertItem';

export function AlertsPage() {
  const alerts = useAlerts();
  const toast = useToast();
  const restore = useCrudMutation(
    () => api.del('/alerts/dismissed'),
    'Volvimos a mostrar las alertas descartadas',
  );
  if (alerts.isPending) return <PageSpinner />;
  if (alerts.isError)
    return <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Alertas</h1>
      <Card>
        <StatusSummary status={alerts.data.status} />
      </Card>
      {alerts.data.items.length === 0 ? (
        <EmptyState title="Todo en orden" description="No tienes alertas por ahora." />
      ) : (
        <ul className="space-y-2">
          {alerts.data.items.map((a) => (
            <DismissibleAlert key={a.key} alert={a} />
          ))}
        </ul>
      )}
      <Button
        variant="ghost"
        requiresNetwork
        loading={restore.isPending}
        onClick={() =>
          restore.mutate(undefined, {
            onError: (err) => toast.show({ message: err.message, tone: 'error' }),
          })
        }
      >
        Mostrar las alertas descartadas
      </Button>
    </div>
  );
}

/** Pendiente 1 de la Fase 2: cada fila tiene su propia mutación, así su estado y su error no se pierden. */
function DismissibleAlert({ alert }: { alert: AlertDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const dismiss = useMutation<unknown, ApiError, void>({
    mutationFn: () => api.post(`/alerts/${alert.key}/dismiss`),
    onSuccess: () =>
      Promise.all(
        [qk.alerts, qk.dashboard].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
    onError: (err) => toast.show({ message: err.message, tone: 'error' }),
  });
  return (
    <AlertItem alert={alert} dismissing={dismiss.isPending} onDismiss={() => dismiss.mutate()} />
  );
}
