import { deriveMethod, type TransactionDTO } from '@finanzas/shared';
import type { Prisma } from '../../generated/prisma/client';
import { fromDbDate, num } from '../../lib/db';
import { accountRefSelect, categoryRefSelect, refSelect } from '../../lib/selects';

export const transactionInclude = {
  account: { select: accountRefSelect },
  toAccount: { select: accountRefSelect },
  creditCard: { select: refSelect },
  debt: { select: refSelect },
  category: { select: categoryRefSelect },
  companion: { select: refSelect },
  tags: { select: { tag: { select: { name: true } } } },
  children: { select: { amount: true } },
} satisfies Prisma.TransactionInclude;

export type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

export function toTransactionDTO(row: TransactionRow): TransactionDTO {
  return {
    id: row.id,
    type: row.type,
    amount: num(row.amount),
    date: fromDbDate(row.date),
    description: row.description,
    payee: row.payee,
    notes: row.notes,
    account: row.account,
    toAccount: row.toAccount,
    creditCard: row.creditCard,
    debt: row.debt,
    category: row.category,
    companion: row.companion,
    goalId: row.goalId,
    installments: row.installments,
    paymentMethod: row.paymentMethod,
    method: deriveMethod(row.type, row.paymentMethod, row.account?.type ?? null),
    parentId: row.parentId,
    interest: row.type === 'DEBT_PAYMENT' ? row.children.reduce((s, c) => s + num(c.amount), 0) : 0,
    tags: row.tags.map((t) => t.tag.name).sort(),
    createdAt: row.createdAt.toISOString(),
  };
}
