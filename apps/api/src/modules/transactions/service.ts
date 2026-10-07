import {
  formatCOP,
  SYSTEM_CATEGORY_KEYS,
  type IsoDate,
  type TransactionDTO,
  type TransactionInput,
  type TransactionResultDTO,
  type WarningCode,
} from '@finanzas/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { accountBalance } from '../accounts/service';
import { findSystemCategory } from '../categories/service';
import { cardDebt } from '../credit-cards/service';
import { loanBalance } from '../debts/service';
import { toTransactionDTO, transactionInclude } from './mapper';
import { resolveRefs, type ResolvedRefs } from './refs';

export function assertNotFuture(date: IsoDate, today: IsoDate) {
  if (date > today) {
    throw badRequest('FUTURE_DATE', 'La fecha no puede ser futura.', {
      date: 'La fecha no puede ser futura',
    });
  }
}

export function rowData(input: TransactionInput) {
  const common = {
    amount: BigInt(input.amount),
    date: toDbDate(input.date),
    description: input.description,
    payee: input.payee,
    notes: input.notes,
  };
  switch (input.type) {
    case 'INCOME':
      return { ...common, accountId: input.accountId, categoryId: input.categoryId };
    case 'EXPENSE':
      return {
        ...common,
        accountId: input.accountId,
        categoryId: input.categoryId,
        paymentMethod: input.paymentMethod ?? null,
      };
    case 'TRANSFER':
      return {
        ...common,
        accountId: input.accountId,
        toAccountId: input.toAccountId,
        goalId: input.goalId ?? null,
      };
    case 'CARD_PURCHASE':
      return {
        ...common,
        creditCardId: input.creditCardId,
        categoryId: input.categoryId,
        installments: input.installments,
      };
    case 'CARD_PAYMENT':
      return { ...common, creditCardId: input.creditCardId, accountId: input.accountId };
    case 'DEBT_PAYMENT':
    case 'DEBT_DISBURSEMENT':
      return { ...common, debtId: input.debtId, accountId: input.accountId };
  }
}

export async function checkRules(
  db: DbClient,
  userId: string,
  input: TransactionInput,
  refs: ResolvedRefs,
  excludeIds: string[],
) {
  if (input.type === 'CARD_PAYMENT' && refs.card) {
    const debt = await cardDebt(db, userId, refs.card, excludeIds);
    if (input.amount > debt) {
      throw badRequest(
        'PAYMENT_EXCEEDS_DEBT',
        `El pago supera la deuda actual de la tarjeta (${formatCOP(Math.max(debt, 0))}).`,
        {
          amount: 'Supera la deuda de la tarjeta',
        },
      );
    }
  }
  if (input.type === 'DEBT_PAYMENT' && refs.debt) {
    const balance = await loanBalance(db, userId, refs.debt, excludeIds);
    if (input.amount > balance) {
      throw badRequest(
        'PAYMENT_EXCEEDS_DEBT',
        `El abono supera el saldo del préstamo (${formatCOP(Math.max(balance, 0))}).`,
        {
          amount: 'Supera el saldo del préstamo',
        },
      );
    }
  }
}

export async function syncTags(
  tx: Prisma.TransactionClient,
  userId: string,
  transactionId: string,
  names: string[],
) {
  await tx.transactionTag.deleteMany({ where: { userId, transactionId } });
  for (const name of new Set(names)) {
    const tag = await tx.tag.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name },
      update: {},
      select: { id: true },
    });
    await tx.transactionTag.create({ data: { userId, transactionId, tagId: tag.id } });
  }
}

/** Crea, actualiza o elimina el gasto hijo de intereses de un pago de préstamo. */
export async function syncInterest(
  tx: Prisma.TransactionClient,
  userId: string,
  parent: { id: string; date: Date; accountId: string; debtName: string },
  interest: number,
  interestCategoryId: string | null,
) {
  const existing = await tx.transaction.findFirst({
    where: { userId, parentId: parent.id },
    select: { id: true },
  });
  if (interest > 0 && interestCategoryId) {
    const data = {
      amount: BigInt(interest),
      date: parent.date,
      accountId: parent.accountId,
      categoryId: interestCategoryId,
      description: `Intereses ${parent.debtName}`,
    };
    if (existing)
      await tx.transaction.update({ where: { id_userId: { id: existing.id, userId } }, data });
    else
      await tx.transaction.create({
        data: { ...data, userId, type: 'EXPENSE', parentId: parent.id },
      });
  } else if (existing) {
    await tx.transaction.delete({ where: { id_userId: { id: existing.id, userId } } });
  }
}

export async function interestCategoryFor(db: DbClient, userId: string, input: TransactionInput) {
  if (input.type !== 'DEBT_PAYMENT' || input.interest <= 0) return null;
  return (await findSystemCategory(db, userId, SYSTEM_CATEGORY_KEYS.INTEREST)).id;
}

const OUTGOING = new Set(['EXPENSE', 'TRANSFER', 'CARD_PAYMENT', 'DEBT_PAYMENT']);

export async function computeWarnings(
  db: DbClient,
  userId: string,
  input: TransactionInput,
  refs: ResolvedRefs,
) {
  const warnings: WarningCode[] = [];
  if (
    OUTGOING.has(input.type) &&
    refs.account &&
    (await accountBalance(db, userId, refs.account)) < 0
  ) {
    warnings.push('NEGATIVE_BALANCE');
  }
  if (
    input.type === 'CARD_PURCHASE' &&
    refs.card &&
    (await cardDebt(db, userId, refs.card)) > num(refs.card.creditLimit)
  ) {
    warnings.push('OVER_CREDIT_LIMIT');
  }
  const openings = [refs.account, refs.toAccount, refs.card].flatMap((r) =>
    r ? [fromDbDate(r.openingDate)] : [],
  );
  if (openings.some((d) => input.date < d)) warnings.push('BEFORE_OPENING_DATE');
  return warnings;
}

export async function getTransaction(
  db: DbClient,
  userId: string,
  id: string,
): Promise<TransactionDTO> {
  const row = await db.transaction.findUnique({
    where: { id_userId: { id, userId } },
    include: transactionInclude,
  });
  if (!row) throw notFound('Movimiento no encontrado.');
  return toTransactionDTO(row);
}

export async function createTransaction(
  db: PrismaClient,
  auth: AuthContext,
  input: TransactionInput,
): Promise<TransactionResultDTO> {
  assertNotFuture(input.date, auth.today);
  const refs = await resolveRefs(db, auth.userId, input);
  await checkRules(db, auth.userId, input, refs, []);
  const interestCategoryId = await interestCategoryFor(db, auth.userId, input);

  const id = await db.$transaction(async (tx) => {
    const row = await tx.transaction.create({
      data: { userId: auth.userId, type: input.type, ...rowData(input) },
      select: { id: true, date: true },
    });
    await syncTags(tx, auth.userId, row.id, input.tags);
    if (input.type === 'DEBT_PAYMENT') {
      await syncInterest(
        tx,
        auth.userId,
        { id: row.id, date: row.date, accountId: input.accountId, debtName: refs.debt!.name },
        input.interest,
        interestCategoryId,
      );
    }
    return row.id;
  });

  return {
    transaction: await getTransaction(db, auth.userId, id),
    warnings: await computeWarnings(db, auth.userId, input, refs),
  };
}

export async function deleteTransaction(
  db: PrismaClient,
  userId: string,
  id: string,
): Promise<void> {
  const row = await db.transaction.findUnique({
    where: { id_userId: { id, userId } },
    select: { parentId: true },
  });
  if (!row) throw notFound('Movimiento no encontrado.');
  if (row.parentId) {
    throw badRequest(
      'EDIT_PARENT',
      'Este movimiento es parte de un pago de préstamo. Edita o elimina el pago principal.',
    );
  }
  await db.$transaction([
    db.scheduledItem.updateMany({
      where: { userId, transactionId: id },
      data: { transactionId: null, status: 'PENDING' },
    }),
    db.transaction.delete({ where: { id_userId: { id, userId } } }),
  ]);
}

export async function updateTransaction(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: TransactionInput,
): Promise<TransactionResultDTO> {
  const existing = await db.transaction.findUnique({
    where: { id_userId: { id, userId: auth.userId } },
  });
  if (!existing) throw notFound('Movimiento no encontrado.');
  if (existing.parentId) {
    throw badRequest(
      'EDIT_PARENT',
      'Este movimiento es parte de un pago de préstamo. Edita el pago principal.',
    );
  }
  if (existing.type !== input.type) {
    throw badRequest(
      'TYPE_CHANGE_NOT_ALLOWED',
      'No se puede cambiar el tipo de un movimiento. Elimínalo y crea uno nuevo.',
    );
  }
  assertNotFuture(input.date, auth.today);
  const refs = await resolveRefs(db, auth.userId, input, existing);
  const children = await db.transaction.findMany({
    where: { userId: auth.userId, parentId: id },
    select: { id: true },
  });
  await checkRules(db, auth.userId, input, refs, [id, ...children.map((c) => c.id)]);
  const interestCategoryId = await interestCategoryFor(db, auth.userId, input);

  await db.$transaction(async (tx) => {
    const row = await tx.transaction.update({
      where: { id_userId: { id, userId: auth.userId } },
      data: rowData(input),
      select: { id: true, date: true },
    });
    await syncTags(tx, auth.userId, id, input.tags);
    if (input.type === 'DEBT_PAYMENT') {
      await syncInterest(
        tx,
        auth.userId,
        { id: row.id, date: row.date, accountId: input.accountId, debtName: refs.debt!.name },
        input.interest,
        interestCategoryId,
      );
    }
  });

  return {
    transaction: await getTransaction(db, auth.userId, id),
    warnings: await computeWarnings(db, auth.userId, input, refs),
  };
}
