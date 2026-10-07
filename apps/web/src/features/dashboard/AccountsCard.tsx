import { ACCOUNT_TYPE_LABELS, type AccountDTO } from '@finanzas/shared';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Card, CardTitle } from '../../components/ui/Card';
import { Icon } from '../../lib/icons';

export function AccountsCard({ accounts, total }: { accounts: AccountDTO[]; total: number }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Mi dinero</CardTitle>
        <Link to="/accounts" className="text-sm text-primary">
          Ver cuentas
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3">
            <span
              className="flex size-9 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: a.color }}
            >
              <Icon name={a.icon} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{a.name}</span>
              <span className="block text-xs text-muted">{ACCOUNT_TYPE_LABELS[a.type]}</span>
            </span>
            <Amount value={a.balance} tone="balance" className="text-sm font-medium" />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 font-semibold">
        <span>Total</span>
        <Amount value={total} tone="balance" />
      </div>
    </Card>
  );
}
