import type { DerivedMethod, Page, TransactionDTO, TransactionListQuery } from '@finanzas/shared';
import type { Prisma } from '../../generated/prisma/client';
import { fromDbDate, toDbDate } from '../../lib/db';
import type { DbClient } from '../../lib/prisma';
import { decodeCursor, encodeCursor } from './cursor';
import { toTransactionDTO, transactionInclude } from './mapper';

/** Mismo criterio que `deriveMethod`: sobrescritura explícita o tipo de la cuenta. */
export function methodWhere(method: DerivedMethod): Prisma.TransactionWhereInput {
  const byAccount = (
    types: Array<'CASH' | 'BANK' | 'DIGITAL_WALLET' | 'SAVINGS' | 'INVESTMENT' | 'OTHER'>,
  ) => ({
    paymentMethod: null,
    account: { is: { type: { in: types } } },
  });
  switch (method) {
    case 'CREDIT_CARD':
      return { type: 'CARD_PURCHASE' };
    case 'BANK':
      return { type: 'EXPENSE', ...byAccount(['BANK']) };
    case 'DEBIT_CARD':
    case 'BANK_TRANSFER':
      return { type: 'EXPENSE', paymentMethod: method };
    case 'CASH':
      return { type: 'EXPENSE', OR: [{ paymentMethod: 'CASH' }, byAccount(['CASH'])] };
    case 'DIGITAL_WALLET':
      return {
        type: 'EXPENSE',
        OR: [{ paymentMethod: 'DIGITAL_WALLET' }, byAccount(['DIGITAL_WALLET'])],
      };
    case 'OTHER':
      return {
        type: 'EXPENSE',
        OR: [{ paymentMethod: 'OTHER' }, byAccount(['SAVINGS', 'INVESTMENT', 'OTHER'])],
      };
  }
}

export async function listTransactions(
  db: DbClient,
  userId: string,
  q: TransactionListQuery,
): Promise<Page<TransactionDTO>> {
  const where: Prisma.TransactionWhereInput = { userId };
  const and: Prisma.TransactionWhereInput[] = [];

  if (q.from || q.to) {
    where.date = { ...(q.from && { gte: toDbDate(q.from) }), ...(q.to && { lte: toDbDate(q.to) }) };
  }
  if (q.type?.length) where.type = { in: q.type };
  if (q.categoryId) {
    const children = await db.category.findMany({
      where: { userId, parentId: q.categoryId },
      select: { id: true },
    });
    where.categoryId = { in: [q.categoryId, ...children.map((c) => c.id)] };
  }
  if (q.accountId) and.push({ OR: [{ accountId: q.accountId }, { toAccountId: q.accountId }] });
  if (q.creditCardId) where.creditCardId = q.creditCardId;
  if (q.debtId) where.debtId = q.debtId;
  if (q.tag) where.tags = { some: { tag: { name: q.tag } } };
  if (q.method) and.push(methodWhere(q.method));
  if (q.minAmount !== undefined || q.maxAmount !== undefined) {
    where.amount = {
      ...(q.minAmount !== undefined && { gte: BigInt(q.minAmount) }),
      ...(q.maxAmount !== undefined && { lte: BigInt(q.maxAmount) }),
    };
  }
  if (q.q) {
    and.push({
      OR: [
        { description: { contains: q.q, mode: 'insensitive' } },
        { payee: { contains: q.q, mode: 'insensitive' } },
        { notes: { contains: q.q, mode: 'insensitive' } },
      ],
    });
  }
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    const date = toDbDate(c.date);
    const createdAt = new Date(c.createdAt);
    and.push({
      OR: [
        { date: { lt: date } },
        { date, createdAt: { lt: createdAt } },
        { date, createdAt, id: { lt: c.id } },
      ],
    });
  }
  if (and.length) where.AND = and;

  const rows = await db.transaction.findMany({
    where,
    include: transactionInclude,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
  });
  const items = rows.slice(0, q.limit);
  const last = items.at(-1);
  return {
    items: items.map(toTransactionDTO),
    nextCursor:
      rows.length > q.limit && last
        ? encodeCursor({
            date: fromDbDate(last.date),
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          })
        : null,
  };
}
