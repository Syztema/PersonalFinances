import type { IsoDate } from '@finanzas/shared';
import type { LedgerEntry } from '../../domain/ledger';
import type { Prisma } from '../../generated/prisma/client';
import { num, toDbDate } from '../../lib/db';
import type { DbClient } from '../../lib/prisma';

export interface LedgerFilter {
  from?: IsoDate;
  to?: IsoDate;
  accountId?: string;
  creditCardId?: string;
  debtId?: string;
  excludeIds?: string[];
}

/** Totales agrupados por tipo y referencias; el dominio aplica los efectos. */
export async function ledgerEntries(
  db: DbClient,
  userId: string,
  filter: LedgerFilter = {},
): Promise<LedgerEntry[]> {
  const where: Prisma.TransactionWhereInput = { userId };
  if (filter.from || filter.to) {
    where.date = {
      ...(filter.from && { gte: toDbDate(filter.from) }),
      ...(filter.to && { lte: toDbDate(filter.to) }),
    };
  }
  if (filter.accountId)
    where.OR = [{ accountId: filter.accountId }, { toAccountId: filter.accountId }];
  if (filter.creditCardId) where.creditCardId = filter.creditCardId;
  if (filter.debtId) where.debtId = filter.debtId;
  if (filter.excludeIds?.length) where.id = { notIn: filter.excludeIds };

  const rows = await db.transaction.groupBy({
    by: ['type', 'accountId', 'toAccountId', 'creditCardId', 'debtId'],
    where,
    _sum: { amount: true },
  });
  return rows.map((r) => ({
    type: r.type,
    amount: num(r._sum.amount),
    accountId: r.accountId,
    toAccountId: r.toAccountId,
    creditCardId: r.creditCardId,
    debtId: r.debtId,
  }));
}
