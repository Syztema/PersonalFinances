import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'No pudimos cargar la información.';
  return (
    <EmptyState
      icon={<CircleAlert />}
      title={message}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        ) : undefined
      }
    />
  );
}
