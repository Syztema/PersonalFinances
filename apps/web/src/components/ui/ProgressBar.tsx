import { cn } from '../../lib/cn';

/** Barra de avance: ámbar desde 75 %, roja desde 90 % (addendum §6.2); las metas siempre en verde. */
export function ProgressBar({
  value,
  label,
  tone = 'auto',
}: {
  value: number;
  label: string;
  tone?: 'auto' | 'positive';
}) {
  const pct = Math.max(0, Math.round(value * 100));
  const color =
    tone === 'positive'
      ? 'bg-positive'
      : value >= 0.9
        ? 'bg-negative'
        : value >= 0.75
          ? 'bg-warning'
          : 'bg-primary';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className={cn('h-full rounded-full', color)}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}
