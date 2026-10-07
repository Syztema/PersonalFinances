import {
  endOfMonth,
  monthKey,
  startOfMonth,
  type BucketKey,
  type BucketProgressDTO,
  type FinancialSettingsDTO,
  type FinancialSettingsInput,
  type FinancialSettingsResponse,
} from '@finanzas/shared';
import { monthFlows, projectedIncome } from '../../domain/balances';
import { pctOf } from '../../domain/savings';
import type { FinancialConfiguration, PrismaClient } from '../../generated/prisma/client';
import { num, toDbDate } from '../../lib/db';
import type { AuthContext } from '../../types/fastify';
import { listAccounts } from '../accounts/service';
import { ledgerEntries } from '../ledger/repository';
import { ensureScheduled } from '../recurring/service';

export function toSettingsDTO(c: FinancialConfiguration): FinancialSettingsDTO {
  return {
    obligationsPct: c.obligationsPct,
    savingsPct: c.savingsPct,
    investmentPct: c.investmentPct,
    leisurePct: c.leisurePct,
    otherPct: c.otherPct,
    monthlyIncomeEstimate: c.monthlyIncomeEstimate != null ? num(c.monthlyIncomeEstimate) : null,
    lowBalanceThreshold: num(c.lowBalanceThreshold),
  };
}

/** Spec 8.8: objetivo = % × ingreso proyectado; real = gasto por bolsa, ahorro e inversión del mes. */
export async function getFinancialSettings(
  db: PrismaClient,
  auth: AuthContext,
): Promise<FinancialSettingsResponse> {
  const { userId, today } = auth;
  await ensureScheduled(db, userId, today);
  const month = { gte: toDbDate(startOfMonth(today)), lte: toDbDate(endOfMonth(today)) };
  const [config, accounts, entries, pending, byCategory] = await Promise.all([
    db.financialConfiguration.findUniqueOrThrow({ where: { userId } }),
    listAccounts(db, userId),
    ledgerEntries(db, userId, { from: startOfMonth(today), to: endOfMonth(today) }),
    db.scheduledItem.aggregate({
      where: { userId, kind: 'INCOME', status: 'PENDING', dueDate: month },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: { in: ['EXPENSE', 'CARD_PURCHASE'] }, date: month },
      _sum: { amount: true },
    }),
  ]);
  const flows = monthFlows(entries, new Map(accounts.map((a) => [a.id, a.type])));
  const settings = toSettingsDTO(config);
  const income = projectedIncome(
    flows.income,
    num(pending._sum.amount),
    settings.monthlyIncomeEstimate,
  );

  const categories = await db.category.findMany({
    where: { userId, id: { in: byCategory.flatMap((r) => (r.categoryId ? [r.categoryId] : [])) } },
    select: { id: true, bucket: true },
  });
  const bucketOf = new Map(categories.map((c) => [c.id, c.bucket ?? 'OTHER']));
  const spent = { OBLIGATIONS: 0, LEISURE: 0, OTHER: 0 };
  for (const row of byCategory) {
    const bucket = (row.categoryId ? bucketOf.get(row.categoryId) : undefined) ?? 'OTHER';
    spent[bucket] += num(row._sum.amount);
  }

  const bucket = (
    key: BucketKey,
    label: string,
    pct: number,
    actual: number,
  ): BucketProgressDTO => ({
    key,
    label,
    pct,
    target: pctOf(income, pct),
    actual,
  });
  return {
    settings,
    month: {
      key: monthKey(today),
      projectedIncome: income,
      buckets: [
        bucket('OBLIGATIONS', 'Obligaciones', settings.obligationsPct, spent.OBLIGATIONS),
        bucket('SAVINGS', 'Ahorro', settings.savingsPct, flows.savings),
        bucket('INVESTMENT', 'Inversión', settings.investmentPct, flows.investment),
        bucket('LEISURE', 'Entretenimiento', settings.leisurePct, spent.LEISURE),
        bucket('OTHER', 'Otros', settings.otherPct, spent.OTHER),
      ],
    },
  };
}

export async function updateFinancialSettings(
  db: PrismaClient,
  auth: AuthContext,
  input: FinancialSettingsInput,
): Promise<FinancialSettingsResponse> {
  await db.financialConfiguration.update({
    where: { userId: auth.userId },
    data: {
      ...input,
      monthlyIncomeEstimate:
        input.monthlyIncomeEstimate !== null ? BigInt(input.monthlyIncomeEstimate) : null,
      lowBalanceThreshold: BigInt(input.lowBalanceThreshold),
    },
  });
  return getFinancialSettings(db, auth);
}
