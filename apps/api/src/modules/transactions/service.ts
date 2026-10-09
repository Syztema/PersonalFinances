import {
  formatCOP,
  SYSTEM_CATEGORY_KEYS,
  type IsoDate,
  type RecurringOnCreateInput,
  type TransactionDTO,
  type TransactionInput,
  type TransactionResultDTO,
  type TransactionType,
  type WarningCode,
} from '@finanzas/shared';
import type { Prisma, PrismaClient, Transaction } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, entityDeleted, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { accountBalance } from '../accounts/service';
import { findSystemCategory } from '../categories/service';
import { cardDebt } from '../credit-cards/service';
import { loanBalance } from '../debts/service';
import {
  assertGoalAccount,
  assertGoalsNotNegative,
  goalProgressNegative,
  lockGoals,
  relockMovement,
  withdrawalExceedsGoal,
  type LockedGoal,
} from '../goals/guard';
import { applyLink, prepareLink } from '../scheduled/link';
import { toTransactionDTO, transactionInclude } from './mapper';
import { resolveRefs, type ResolveOptions, type ResolvedRefs } from './refs';

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
        companionId: input.companionId ?? null,
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
        companionId: input.companionId ?? null,
      };
    case 'CARD_PAYMENT':
      return { ...common, creditCardId: input.creditCardId, accountId: input.accountId };
    case 'DEBT_PAYMENT':
    case 'DEBT_DISBURSEMENT':
      return { ...common, debtId: input.debtId, accountId: input.accountId };
  }
}

/** Meta de una transferencia (abono o retiro); los demás tipos no tienen. */
const goalIdOf = (input: TransactionInput) =>
  input.type === 'TRANSFER' ? (input.goalId ?? null) : null;

/** Con la meta bloqueada, revisa que la transferencia siga entrando o saliendo de su cuenta. */
function checkLockedGoal(goals: Map<string, LockedGoal>, input: TransactionInput) {
  if (input.type === 'TRANSFER' && input.goalId) {
    assertGoalAccount(goals, input.goalId, input.accountId, input.toAccountId);
  }
}

const NO_REFS = {
  accountId: null,
  toAccountId: null,
  creditCardId: null,
  debtId: null,
  categoryId: null,
  goalId: null,
  installments: null,
  paymentMethod: null,
  companionId: null,
};

/** Fila completa del tipo: los campos que no aplican quedan en null (para editar y comparar). */
export function fullRowData(input: TransactionInput) {
  return { ...NO_REFS, type: input.type, ...rowData(input) };
}

const holder = { select: { name: true, isActive: true } } as const;
type Holder = { name: string; isActive: boolean } | null;

/** Nombre del primer elemento eliminado que toca el movimiento (su dinero queda congelado). */
function deletedHolder(row: {
  account: Holder;
  toAccount: Holder;
  creditCard: Holder;
  debt: Holder;
}): string | null {
  return (
    [row.account, row.toAccount, row.creditCard, row.debt].find((h) => h && !h.isActive)?.name ??
    null
  );
}

/** ¿La edición cambia algo que afecta saldos o deudas? */
function changesMoney(
  existing: Transaction & { children: Array<{ amount: bigint }> },
  input: TransactionInput,
): boolean {
  const next = fullRowData(input);
  return (
    existing.type !== input.type ||
    num(existing.amount) !== input.amount ||
    fromDbDate(existing.date) !== input.date ||
    existing.accountId !== next.accountId ||
    existing.toAccountId !== next.toAccountId ||
    existing.creditCardId !== next.creditCardId ||
    existing.debtId !== next.debtId ||
    existing.installments !== next.installments ||
    (input.type === 'DEBT_PAYMENT' &&
      existing.children.reduce((s, c) => s + num(c.amount), 0) !== input.interest)
  );
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

export interface PreparedTransaction {
  input: TransactionInput;
  refs: ResolvedRefs;
  interestCategoryId: string | null;
}

/** Validaciones que solo leen (antes de abrir la transacción de base de datos). */
export async function prepareTransaction(
  db: DbClient,
  auth: AuthContext,
  input: TransactionInput,
  options: ResolveOptions = {},
): Promise<PreparedTransaction> {
  assertNotFuture(input.date, auth.today);
  const refs = await resolveRefs(db, auth.userId, input, undefined, options);
  await checkRules(db, auth.userId, input, refs, []);
  return { input, refs, interestCategoryId: await interestCategoryFor(db, auth.userId, input) };
}

/** Escribe el movimiento con sus etiquetas e intereses; se compone con otras escrituras. */
export async function insertTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  p: PreparedTransaction,
): Promise<string> {
  const { input, refs } = p;
  const row = await tx.transaction.create({
    data: { userId, type: input.type, ...rowData(input) },
    select: { id: true, date: true },
  });
  await syncTags(tx, userId, row.id, input.tags);
  if (input.type === 'DEBT_PAYMENT') {
    await syncInterest(
      tx,
      userId,
      { id: row.id, date: row.date, accountId: input.accountId, debtName: refs.debt!.name },
      input.interest,
      p.interestCategoryId,
    );
  }
  return row.id;
}

export async function transactionResult(
  db: DbClient,
  userId: string,
  id: string,
  p: PreparedTransaction,
): Promise<TransactionResultDTO> {
  return {
    transaction: await getTransaction(db, userId, id),
    warnings: await computeWarnings(db, userId, p.input, p.refs),
  };
}

/** Campos que solo se aceptan al registrar (spec 8.11). */
export function linkFieldsOf(input: TransactionInput): {
  scheduledItemId: string | null;
  recurring: RecurringOnCreateInput | null;
} {
  return input.type === 'INCOME' || input.type === 'EXPENSE' || input.type === 'CARD_PURCHASE'
    ? { scheduledItemId: input.scheduledItemId ?? null, recurring: input.recurring ?? null }
    : { scheduledItemId: null, recurring: null };
}

export async function createTransaction(
  db: PrismaClient,
  auth: AuthContext,
  input: TransactionInput,
): Promise<TransactionResultDTO> {
  const p = await prepareTransaction(db, auth, input);
  const link = await prepareLink(db, auth.userId, input, linkFieldsOf(input));
  const name = (input.description ?? p.refs.category?.name ?? 'Recurrente').slice(0, 60);
  const id = await db.$transaction(async (tx) => {
    // Spec Fase 3 §8.2: la meta queda bloqueada hasta el final; dos retiros a la vez no pasan el tope.
    const goals = await lockGoals(tx, auth.userId, [goalIdOf(input)]);
    checkLockedGoal(goals, input);
    const created = await insertTransaction(tx, auth.userId, p);
    await applyLink(tx, auth.userId, created, input, link, name);
    await assertGoalsNotNegative(tx, auth.userId, goals, withdrawalExceedsGoal);
    return created;
  });
  return transactionResult(db, auth.userId, id, p);
}

export async function deleteTransaction(
  db: PrismaClient,
  userId: string,
  id: string,
): Promise<void> {
  const row = await db.transaction.findUnique({
    where: { id_userId: { id, userId } },
    select: {
      parentId: true,
      goalId: true,
      account: holder,
      toAccount: holder,
      creditCard: holder,
      debt: holder,
    },
  });
  if (!row) throw notFound('Movimiento no encontrado.');
  if (row.parentId) {
    throw badRequest(
      'EDIT_PARENT',
      'Este movimiento es parte de un pago de préstamo. Edita o elimina el pago principal.',
    );
  }
  const frozen = deletedHolder(row);
  if (frozen) throw entityDeleted(frozen, 'eliminar este movimiento');
  await db.$transaction(async (tx) => {
    // Spec Fase 3 §8.2: borrar un abono no puede dejar la meta con saldo negativo.
    const goals = await lockGoals(tx, userId, [row.goalId]);
    await relockMovement(tx, userId, id, row.goalId);
    await tx.scheduledItem.updateMany({
      where: { userId, transactionId: id },
      data: { transactionId: null, status: 'PENDING' },
    });
    await tx.transaction.delete({ where: { id_userId: { id, userId } } });
    await assertGoalsNotNegative(tx, userId, goals, goalProgressNegative);
  });
}

/** Addendum §4: elegir una cuenta o una tarjeta convierte el gasto en compra con tarjeta y viceversa. */
const SWITCHABLE = new Set<TransactionType>(['EXPENSE', 'CARD_PURCHASE']);

export async function updateTransaction(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: TransactionInput,
): Promise<TransactionResultDTO> {
  const existing = await db.transaction.findUnique({
    where: { id_userId: { id, userId: auth.userId } },
    include: {
      account: holder,
      toAccount: holder,
      creditCard: holder,
      debt: holder,
      children: { select: { amount: true } },
    },
  });
  if (!existing) throw notFound('Movimiento no encontrado.');
  if (existing.parentId) {
    throw badRequest(
      'EDIT_PARENT',
      'Este movimiento es parte de un pago de préstamo. Edita el pago principal.',
    );
  }
  if (
    existing.type !== input.type &&
    !(SWITCHABLE.has(existing.type) && SWITCHABLE.has(input.type))
  ) {
    throw badRequest(
      'TYPE_CHANGE_NOT_ALLOWED',
      'Elimina el movimiento y regístralo de nuevo con el tipo correcto.',
    );
  }
  const link = linkFieldsOf(input);
  if (link.scheduledItemId || link.recurring) {
    throw badRequest(
      'LINK_ON_EDIT',
      'Solo puedes enlazar una obligación o marcarlo como recurrente al registrarlo.',
    );
  }
  const frozen = deletedHolder(existing);
  if (frozen && changesMoney(existing, input)) {
    throw entityDeleted(frozen, 'modificar este movimiento');
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
    // Spec Fase 3 §8.2: editar un abono o un retiro revisa la meta de antes y la de ahora.
    const goals = await lockGoals(tx, auth.userId, [existing.goalId, goalIdOf(input)]);
    checkLockedGoal(goals, input);
    await relockMovement(tx, auth.userId, id, existing.goalId);
    const row = await tx.transaction.update({
      where: { id_userId: { id, userId: auth.userId } },
      data: fullRowData(input),
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
    await assertGoalsNotNegative(tx, auth.userId, goals, withdrawalExceedsGoal);
  });

  return {
    transaction: await getTransaction(db, auth.userId, id),
    warnings: await computeWarnings(db, auth.userId, input, refs),
  };
}
