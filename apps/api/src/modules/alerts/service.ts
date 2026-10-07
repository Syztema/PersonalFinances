import {
  addDays,
  dayOfMonth,
  diffDays,
  endOfMonth,
  type AlertDTO,
  type IsoDate,
  type StatusDTO,
} from '@finanzas/shared';
import { computeAlerts, overallStatus, unusualExpenses } from '../../domain/alerts';
import { pctOf } from '../../domain/savings';
import type { PrismaClient } from '../../generated/prisma/client';
import { num, toDbDate } from '../../lib/db';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import type { PlanningSnapshot } from '../planning/snapshot';

const EXPENSES = { in: ['EXPENSE' as const, 'CARD_PURCHASE' as const] };

/** Spec 8.12: movimientos de los últimos 7 días contra la mediana de su categoría en los 90 previos. */
async function loadUnusual(db: DbClient, userId: string, today: IsoDate) {
  const recent = await db.transaction.findMany({
    where: {
      userId,
      type: EXPENSES,
      parentId: null,
      date: { gte: toDbDate(addDays(today, -6)), lte: toDbDate(today) },
    },
    select: {
      id: true,
      amount: true,
      description: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });
  const categoryIds = [...new Set(recent.flatMap((r) => (r.categoryId ? [r.categoryId] : [])))];
  if (categoryIds.length === 0) return [];
  const history = await db.transaction.findMany({
    where: {
      userId,
      type: EXPENSES,
      parentId: null,
      categoryId: { in: categoryIds },
      date: { gte: toDbDate(addDays(today, -96)), lte: toDbDate(addDays(today, -7)) },
    },
    select: { categoryId: true, amount: true },
  });
  const byCategory = new Map<string, number[]>();
  for (const h of history) {
    if (h.categoryId)
      byCategory.set(h.categoryId, [...(byCategory.get(h.categoryId) ?? []), num(h.amount)]);
  }
  return unusualExpenses(
    recent.flatMap((r) =>
      r.categoryId
        ? [
            {
              id: r.id,
              categoryId: r.categoryId,
              categoryName: r.category?.name ?? '',
              description: r.description,
              amount: num(r.amount),
            },
          ]
        : [],
    ),
    byCategory,
  );
}

/** F(fin de mes) − gasto discrecional diario promedio × días restantes (spec 8.12). */
function projectedEnd(snap: PlanningSnapshot): number {
  const daysLeft = diffDays(snap.today, endOfMonth(snap.today)) + 1;
  const averageDaily = snap.discretionaryMonth / dayOfMonth(snap.today);
  return snap.spendingPower.endOfMonthBalance - Math.round(averageDaily * daysLeft);
}

export function planningStatus(snap: PlanningSnapshot): StatusDTO {
  const total = snap.budget.dto.total;
  return overallStatus({
    today: snap.today,
    budget: total
      ? {
          budget: total.budget,
          spent: total.spent,
          projectedSpend: snap.budget.dto.projection?.projectedSpend ?? total.spent,
        }
      : null,
    monthExpense: snap.flows.expense,
    projectedIncome: snap.projectedIncome,
    projectionNegative: projectedEnd(snap) < 0,
  });
}

export async function activeAlerts(
  db: PrismaClient,
  auth: AuthContext,
  snap: PlanningSnapshot,
): Promise<AlertDTO[]> {
  const [dismissed, unusual] = await Promise.all([
    db.dismissedAlert.findMany({ where: { userId: auth.userId }, select: { key: true } }),
    loadUnusual(db, auth.userId, auth.today),
  ]);
  const hidden = new Set(dismissed.map((d) => d.key));
  const total = snap.budget.dto.total;
  return computeAlerts({
    today: snap.today,
    hasAccounts: snap.accounts.some((a) => a.isActive),
    budget: {
      total: total ? { budget: total.budget, spent: total.spent } : null,
      lines: snap.budget.dto.lines.map((l) => ({
        categoryId: l.category.id,
        name: l.category.name,
        budget: l.amount,
        spent: l.spent,
      })),
    },
    savings: {
      target: pctOf(snap.projectedIncome, snap.config.savingsPct),
      actual: snap.flows.savings,
    },
    cards: snap.cards.filter((c) => c.isActive),
    obligations: snap.obligations,
    expectedIncomes: snap.incomes,
    monthIncome: snap.flows.income,
    monthExpense: snap.flows.expense,
    unusual,
    available: snap.available.total,
    lowBalanceThreshold: num(snap.config.lowBalanceThreshold),
    projectedEndBalance: projectedEnd(snap),
    negativeAccounts: snap.accounts.filter((a) => a.balance < 0),
  }).filter((a) => !hidden.has(a.key));
}

export async function dismissAlert(db: DbClient, userId: string, key: string): Promise<void> {
  await db.dismissedAlert.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key },
    update: {},
  });
}

export async function restoreAlerts(db: DbClient, userId: string): Promise<void> {
  await db.dismissedAlert.deleteMany({ where: { userId } });
}
