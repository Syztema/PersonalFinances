import type { GoalDTO } from '@finanzas/shared';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Card, CardTitle } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatPercent } from '../../lib/format';

export function GoalsSection({ goals }: { goals: GoalDTO[] }) {
  if (goals.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Metas</CardTitle>
        <Link to="/goals" className="inline-flex min-h-11 items-center text-sm text-primary">
          Ver metas
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {goals.map((g) => (
          <li key={g.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{g.name}</span>
              <span className="shrink-0 text-muted">
                <Amount value={g.progress} tone="balance" /> · {formatPercent(g.pct)}
              </span>
            </div>
            <ProgressBar value={g.pct} label={`Avance de ${g.name}`} tone="positive" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
