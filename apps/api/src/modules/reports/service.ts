import {
  addDays,
  resolveReportPeriod,
  type ExportFormat,
  type IsoDate,
  type PaymentMethod,
  type ReportDTO,
  type ReportPeriod,
  type ReportPeriodInput,
  type TransactionType,
} from '@finanzas/shared';
import { buildReport, type ReportEntry, type ReportInput } from '../../domain/report';
import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { accountRefSelect, categoryRefSelect, refSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';
import { budgetVsSpend } from '../budgets/service';
import { toCsv } from './export/csv';
import { toExportRow, type ExportTransaction } from './export/rows';
import { formatGeneratedAt, toXlsx, XLSX_CONTENT_TYPE } from './export/xlsx';
import { ledgerEntries } from '../ledger/repository';

/** Spec Fase 3 §3.1: un periodo inválido responde 400 `VALIDATION_ERROR` con `fields`. */
export function resolvePeriodOrThrow(input: ReportPeriodInput, today: IsoDate): ReportPeriod {
  const result = resolveReportPeriod(input, today);
  if (!result.ok) {
    throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', result.fields);
  }
  return result.period;
}

/**
 * Spec Fase 3 §3.2: el reporte sale de una sola transacción de solo lectura con aislamiento
 * REPEATABLE READ: una sola conexión y una misma foto de los datos, aunque haya escrituras a la vez.
 * Review 3A M2: 30 s de tiempo límite (no los 10 s del cliente) para que una exportación grande en
 * un servidor lento no termine en un 500; la espera por conexión sigue en 5 s.
 */
export function inReportTransaction<T>(
  db: PrismaClient,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return run(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 },
  );
}

interface GroupRow {
  type: TransactionType;
  accountId: string | null;
  toAccountId: string | null;
  creditCardId: string | null;
  debtId: string | null;
  categoryId?: string | null;
  paymentMethod?: PaymentMethod | null;
  companionId?: string | null;
  _sum: { amount: bigint | null };
}

const entryOf = (r: GroupRow, date: IsoDate): ReportEntry => ({
  date,
  type: r.type,
  amount: num(r._sum.amount),
  accountId: r.accountId,
  toAccountId: r.toAccountId,
  creditCardId: r.creditCardId,
  debtId: r.debtId,
  categoryId: r.categoryId ?? null,
  paymentMethod: r.paymentMethod ?? null,
  companionId: r.companionId ?? null,
});

/** Movimientos del periodo (para contar y exportar). */
export const periodWhere = (userId: string, period: ReportPeriod) => ({
  userId,
  date: { gte: toDbDate(period.from), lte: toDbDate(period.to) },
});

/**
 * Todo lo que necesita `buildReport`, filtrado por `userId`. Lo anterior a `from` llega sumado por
 * tipo y referencias (fechado el día anterior a `from`); lo del periodo, sumado por día.
 */
export async function loadReportData(
  db: DbClient,
  auth: AuthContext,
  period: ReportPeriod,
): Promise<ReportInput> {
  const { userId } = auth;
  const accounts = await db.account.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { ...accountRefSelect, initialBalance: true },
  });
  const cards = await db.creditCard.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { ...refSelect, initialDebt: true },
  });
  const loans = await db.debt.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, initialBalance: true },
  });
  const categories = await db.category.findMany({ where: { userId }, select: categoryRefSelect });
  const companions = await db.companion.findMany({ where: { userId }, select: refSelect });
  const dayBefore = addDays(period.from, -1);
  const before = await ledgerEntries(db, userId, { to: dayBefore });
  const inPeriod = await db.transaction.groupBy({
    by: [
      'date',
      'type',
      'accountId',
      'toAccountId',
      'creditCardId',
      'debtId',
      'categoryId',
      'paymentMethod',
      'companionId',
    ],
    where: periodWhere(userId, period),
    _sum: { amount: true },
  });
  return {
    period,
    accounts: accounts.map(({ initialBalance, ...ref }) => ({
      ref,
      initialBalance: num(initialBalance),
    })),
    cards: cards.map(({ initialDebt, ...ref }) => ({ ref, initialDebt: num(initialDebt) })),
    loans: loans.map((l) => ({ id: l.id, initialBalance: num(l.initialBalance) })),
    categories: new Map(categories.map((c) => [c.id, c])),
    companions: new Map(companions.map((c) => [c.id, c])),
    entries: [
      ...before.map((e) => ({
        ...e,
        date: dayBefore,
        categoryId: null,
        paymentMethod: null,
        companionId: null,
      })),
      ...inPeriod.map((r) => entryOf(r, fromDbDate(r.date))),
    ],
  };
}

/** `GET /api/reports` (spec Fase 3 §3.2): solo lee; no genera ocurrencias ni copia presupuestos. */
export async function loadReport(
  db: PrismaClient,
  auth: AuthContext,
  input: ReportPeriodInput,
): Promise<ReportDTO> {
  const period = resolvePeriodOrThrow(input, auth.today);
  return inReportTransaction(db, async (tx) => {
    const body = buildReport(await loadReportData(tx, auth, period));
    return { ...body, budget: await budgetVsSpend(tx, auth, period.months) };
  });
}

const exportSelect = {
  type: true,
  date: true,
  amount: true,
  description: true,
  notes: true,
  installments: true,
  paymentMethod: true,
  account: { select: { name: true, type: true } },
  toAccount: { select: { name: true } },
  creditCard: { select: { name: true } },
  debt: { select: { name: true } },
  category: { select: { name: true, parent: { select: { name: true } } } },
  companion: { select: { name: true } },
  tags: { select: { tag: { select: { name: true } } } },
} satisfies Prisma.TransactionSelect;

/**
 * Spec Fase 3 §4: todos los movimientos del periodo (los intereses como fila propia), por fecha y
 * `createdAt`; en un empate, el pago va antes que sus intereses.
 */
export async function loadExportTransactions(
  db: DbClient,
  userId: string,
  period: ReportPeriod,
): Promise<ExportTransaction[]> {
  const rows = await db.transaction.findMany({
    where: periodWhere(userId, period),
    orderBy: [
      { date: 'asc' },
      { createdAt: 'asc' },
      { parentId: { sort: 'asc', nulls: 'first' } },
      { id: 'asc' },
    ],
    select: exportSelect,
  });
  return rows.map((r) => ({
    ...r,
    date: fromDbDate(r.date),
    amount: num(r.amount),
    tags: r.tags.map((t) => t.tag.name).sort((x, y) => x.localeCompare(y, 'es')),
  }));
}

export interface ExportFile {
  filename: string;
  contentType: string;
  body: string | Buffer;
}

/**
 * `GET /api/reports/export` (spec Fase 3 §4): cuenta los movimientos antes de armar nada
 * (400 `EXPORT_TOO_LARGE`) y lee todo en la misma transacción de solo lectura que el reporte.
 */
export async function exportReport(
  db: PrismaClient,
  auth: AuthContext,
  input: ReportPeriodInput,
  format: ExportFormat,
  options: { maxRows: number; now: Date },
): Promise<ExportFile> {
  const period = resolvePeriodOrThrow(input, auth.today);
  const { report, rows } = await inReportTransaction(db, async (tx) => {
    const count = await tx.transaction.count({ where: periodWhere(auth.userId, period) });
    if (count > options.maxRows) {
      throw badRequest('EXPORT_TOO_LARGE', 'Elige un periodo más corto.');
    }
    return {
      report: format === 'xlsx' ? buildReport(await loadReportData(tx, auth, period)) : null,
      rows: (await loadExportTransactions(tx, auth.userId, period)).map(toExportRow),
    };
  });
  const range = `${period.from}_${period.to}`;
  if (!report) {
    return {
      filename: `finanzas-movimientos-${range}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: toCsv(rows),
    };
  }
  return {
    filename: `finanzas-reporte-${range}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    body: await toXlsx(report, rows, formatGeneratedAt(options.now, auth.timezone)),
  };
}
