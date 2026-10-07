import {
  diffDays,
  endOfMonth,
  monthKey,
  monthStartFromKey,
  startOfMonth,
  type BudgetDTO,
  type BudgetLineDTO,
  type BudgetPutInput,
  type IsoDate,
} from '@finanzas/shared';
import { budgetProjection, usageOf } from '../../domain/budget';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, isUniqueViolation } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { categoryRefSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';

const budgetInclude = {
  categories: { include: { category: { select: { ...categoryRefSelect, sortOrder: true } } } },
} satisfies Prisma.BudgetInclude;
type BudgetRow = Prisma.BudgetGetPayload<{ include: typeof budgetInclude }>;

export interface BudgetComputation {
  dto: BudgetDTO;
  /** Categorías que cuenta el presupuesto; null = todo el gasto (hay total general). */
  scope: Set<string> | null;
}

const loadRow = (db: DbClient, userId: string, monthStart: IsoDate) =>
  db.budget.findUnique({
    where: { userId_month: { userId, month: toDbDate(monthStart) } },
    include: budgetInclude,
  });

const isEmpty = (row: BudgetRow) => row.totalAmount === null && row.categories.length === 0;

/**
 * Spec 8.9: un mes actual o futuro sin fila copia el último mes anterior que tenga fila, sin las
 * categorías eliminadas. Si esa fila está vacía (se eliminó), no se copia nada (review focus #4).
 * La copia guarda de qué mes viene (`copiedFrom`) hasta que el usuario guarda o vacía el mes
 * (review I2). Devuelve si hay una copia que cargar.
 */
async function copyPrevious(
  db: PrismaClient,
  userId: string,
  monthStart: IsoDate,
): Promise<boolean> {
  const prev = await db.budget.findFirst({
    where: { userId, month: { lt: toDbDate(monthStart) } },
    orderBy: { month: 'desc' },
    include: { categories: { include: { category: { select: { isActive: true } } } } },
  });
  if (!prev) return false;
  const lines = prev.categories.filter((l) => l.category.isActive);
  if (prev.totalAmount === null && lines.length === 0) return false;
  try {
    await db.$transaction(async (tx) => {
      const created = await tx.budget.create({
        data: {
          userId,
          month: toDbDate(monthStart),
          totalAmount: prev.totalAmount,
          copiedFrom: monthKey(fromDbDate(prev.month)),
        },
      });
      if (lines.length > 0) {
        await tx.budgetCategory.createMany({
          data: lines.map((l) => ({
            userId,
            budgetId: created.id,
            categoryId: l.categoryId,
            amount: l.amount,
          })),
        });
      }
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err; // otra petición ya lo copió
  }
  return true;
}

export async function computeBudget(
  db: PrismaClient,
  auth: AuthContext,
  month: string,
): Promise<BudgetComputation> {
  const { userId, today } = auth;
  const monthStart = monthStartFromKey(month);
  const monthEnd = endOfMonth(monthStart);
  let row = await loadRow(db, userId, monthStart);
  if (!row && monthStart >= startOfMonth(today) && (await copyPrevious(db, userId, monthStart))) {
    row = await loadRow(db, userId, monthStart);
  }
  const isCurrent = monthStart === startOfMonth(today);
  const daysLeft = isCurrent ? diffDays(today, monthEnd) + 1 : null;
  if (!row || isEmpty(row)) {
    return {
      dto: {
        month,
        totalAmount: null,
        lines: [],
        total: null,
        projection: null,
        daysLeft,
        copiedFrom: null,
      },
      scope: null,
    };
  }

  const lineIds = row.categories.map((l) => l.categoryId);
  const [spentRows, children] = await Promise.all([
    db.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        type: { in: ['EXPENSE', 'CARD_PURCHASE'] },
        date: { gte: toDbDate(monthStart), lte: toDbDate(monthEnd) },
      },
      _sum: { amount: true },
    }),
    db.category.findMany({
      where: { userId, parentId: { in: lineIds } },
      select: { id: true, parentId: true },
    }),
  ]);
  const spentBy = new Map(spentRows.map((r) => [r.categoryId ?? '', num(r._sum.amount)]));
  const childrenOf = new Map<string, string[]>();
  for (const c of children) {
    if (c.parentId) childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id]);
  }
  const spentIn = (id: string) =>
    (spentBy.get(id) ?? 0) +
    (childrenOf.get(id) ?? []).reduce((s, cid) => s + (spentBy.get(cid) ?? 0), 0);

  const lines: BudgetLineDTO[] = [...row.categories]
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder)
    .map((l) => {
      const { sortOrder: _sortOrder, ...category } = l.category;
      const amount = num(l.amount);
      const spent = spentIn(l.categoryId);
      return {
        id: l.id,
        category,
        amount,
        spent,
        remaining: amount - spent,
        usage: usageOf(spent, amount),
      };
    });

  // Plan, decisión 1: sin total general, cuenta solo lo presupuestado y sus subcategorías.
  const scope =
    row.totalAmount !== null ? null : new Set([...lineIds, ...children.map((c) => c.id)]);
  // Review I1: la línea de una subcategoría cuyo padre también tiene línea es un sublímite; su gasto
  // ya cuenta en el del padre, así que no suma otra vez al presupuesto general.
  const budgeted = new Set(lineIds);
  const budget =
    row.totalAmount !== null
      ? num(row.totalAmount)
      : lines
          .filter((l) => !(l.category.parentId && budgeted.has(l.category.parentId)))
          .reduce((s, l) => s + l.amount, 0);
  const spent = scope
    ? [...scope].reduce((s, id) => s + (spentBy.get(id) ?? 0), 0)
    : [...spentBy.values()].reduce((s, v) => s + v, 0);
  return {
    dto: {
      month,
      totalAmount: row.totalAmount !== null ? num(row.totalAmount) : null,
      lines,
      total: { budget, spent, remaining: budget - spent, usage: usageOf(spent, budget) },
      projection: isCurrent ? budgetProjection({ budget, spent, today }) : null,
      daysLeft,
      copiedFrom: row.copiedFrom,
    },
    scope,
  };
}

export async function getBudget(
  db: PrismaClient,
  auth: AuthContext,
  month: string,
): Promise<BudgetDTO> {
  return (await computeBudget(db, auth, month)).dto;
}

export async function putBudget(
  db: PrismaClient,
  auth: AuthContext,
  month: string,
  input: BudgetPutInput,
): Promise<BudgetDTO> {
  const { userId } = auth;
  const categories = await db.category.findMany({
    where: { userId, id: { in: input.lines.map((l) => l.categoryId) } },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const fields: Record<string, string> = {};
  input.lines.forEach((l, i) => {
    const c = byId.get(l.categoryId);
    if (!c) fields[`lines.${i}.categoryId`] = 'Categoría no encontrada';
    else if (c.kind !== 'EXPENSE')
      fields[`lines.${i}.categoryId`] = 'Debe ser una categoría de gasto';
    else if (!c.isActive || c.isSystem) fields[`lines.${i}.categoryId`] = 'Categoría no disponible';
  });
  if (Object.keys(fields).length > 0) {
    throw badRequest('INVALID_REFERENCE', 'Revisa las categorías del presupuesto.', fields);
  }
  const monthDate = toDbDate(monthStartFromKey(month));
  const totalAmount = input.totalAmount !== null ? BigInt(input.totalAmount) : null;
  await db.$transaction(async (tx) => {
    const budget = await tx.budget.upsert({
      where: { userId_month: { userId, month: monthDate } },
      create: { userId, month: monthDate, totalAmount },
      update: { totalAmount, copiedFrom: null },
    });
    await tx.budgetCategory.deleteMany({ where: { userId, budgetId: budget.id } });
    if (input.lines.length > 0) {
      await tx.budgetCategory.createMany({
        data: input.lines.map((l) => ({
          userId,
          budgetId: budget.id,
          categoryId: l.categoryId,
          amount: BigInt(l.amount),
        })),
      });
    }
  });
  return getBudget(db, auth, month);
}

/** Deja el mes vacío (conserva la fila) para que no se vuelva a copiar. */
export async function clearBudget(db: PrismaClient, userId: string, month: string): Promise<void> {
  const monthDate = toDbDate(monthStartFromKey(month));
  await db.$transaction(async (tx) => {
    const budget = await tx.budget.upsert({
      where: { userId_month: { userId, month: monthDate } },
      create: { userId, month: monthDate },
      update: { totalAmount: null, copiedFrom: null },
    });
    await tx.budgetCategory.deleteMany({ where: { userId, budgetId: budget.id } });
  });
}
