import type { AlertDTO, AlertLevel, StatusDTO } from '@finanzas/shared';
import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { useOnline } from '../../lib/useOnline';

const LEVELS: Record<AlertLevel, { icon: LucideIcon; className: string; label: string }> = {
  DANGER: { icon: OctagonAlert, className: 'text-negative', label: 'Urgente' },
  WARNING: { icon: TriangleAlert, className: 'text-warning', label: 'Atención' },
  INFO: { icon: Info, className: 'text-primary', label: 'Información' },
};

/** Sin red, "Descartar" se deshabilita: descartar es un guardado (spec Fase 3 §6). */
export function AlertItem({
  alert,
  onDismiss,
  dismissing,
}: {
  alert: AlertDTO;
  onDismiss?: () => void;
  dismissing?: boolean;
}) {
  const online = useOnline();
  const level = LEVELS[alert.level];
  const IconComponent = level.icon;
  return (
    <li className="flex gap-3 rounded-xl bg-surface-2 p-3">
      <IconComponent
        size={20}
        className={cn('mt-0.5 shrink-0', level.className)}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-medium', level.className)}>{level.label}</p>
        <p className="text-sm font-medium">{alert.title}</p>
        <p className="text-xs text-muted">{alert.message}</p>
        {(alert.href || onDismiss) && (
          <div className="flex flex-wrap gap-x-4">
            {alert.href && (
              <Link
                to={alert.href}
                className="inline-flex min-h-11 items-center text-sm text-primary"
              >
                Ver
              </Link>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                disabled={dismissing || !online}
                aria-busy={dismissing || undefined}
                aria-label={`Descartar: ${alert.title}`}
                className="inline-flex min-h-11 items-center text-sm text-muted disabled:opacity-50"
              >
                {dismissing ? 'Descartando…' : 'Descartar'}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

const STATUS_DOT: Record<StatusDTO['level'], string> = {
  OK: 'bg-positive',
  WARNING: 'bg-warning',
  DANGER: 'bg-negative',
};
const STATUS_LABEL: Record<StatusDTO['level'], string> = {
  OK: 'Estado verde',
  WARNING: 'Estado amarillo',
  DANGER: 'Estado rojo',
};

/** Spec 8.12: verde "Vas bien", amarillo "Cuidado", rojo "Debes controlar tus gastos". */
export function StatusSummary({ status }: { status: StatusDTO }) {
  return (
    <div className="flex items-start gap-3">
      <span
        role="img"
        aria-label={STATUS_LABEL[status.level]}
        className={cn('mt-1.5 size-3 shrink-0 rounded-full', STATUS_DOT[status.level])}
      />
      <div>
        <p className="font-semibold">{status.title}</p>
        <p className="text-sm text-muted">{status.message}</p>
      </div>
    </div>
  );
}
