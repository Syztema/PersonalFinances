import type { AlertDTO, StatusDTO } from '@finanzas/shared';
import { Link } from 'react-router';
import { Card } from '../../components/ui/Card';
import { AlertItem, StatusSummary } from '../alerts/AlertItem';

export function StatusCard({ status, alerts }: { status: StatusDTO; alerts: AlertDTO[] }) {
  return (
    <Card>
      <StatusSummary status={status} />
      {alerts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {alerts.map((a) => (
            <AlertItem key={a.key} alert={a} />
          ))}
        </ul>
      )}
      <Link to="/alerts" className="mt-2 inline-flex min-h-11 items-center text-sm text-primary">
        Ver todas las alertas
      </Link>
    </Card>
  );
}
