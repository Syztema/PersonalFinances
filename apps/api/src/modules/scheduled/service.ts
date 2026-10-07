import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  type IsoDate,
  type ScheduledCompleteInput,
  type ScheduledCreateInput,
  type ScheduledItemDTO,
  type ScheduledListQuery,
  type ScheduledSuggestionsQuery,
  type ScheduledUpdateInput,
  type TransactionInput,
  type TransactionResultDTO,
} from '@finanzas/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, conflict, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { accountRefSelect, categoryRefSelect, refSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';
import { listCreditCards } from '../credit-cards/service';
import { listDebts } from '../debts/service';
import { checkScheduleRefs } from '../planning/refs';
import { ensureScheduled } from '../recurring/service';
import { insertTransaction, prepareTransaction, transactionResult } from '../transactions/service';

const itemInclude = {
  category: { select: categoryRefSelect },
  account: { select: accountRefSelect },
  creditCard: { select: refSelect },
} satisfies Prisma.ScheduledItemInclude;
type ItemRow = Prisma.ScheduledItemGetPayload<{ include: typeof itemInclude }>;

const NOT_PENDING = () => conflict('NOT_PENDING', 'Esta ocurrencia ya fue pagada u omitida.');

export function toScheduledDTO(r: ItemRow): ScheduledItemDTO {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    amount: num(r.amount),
    dueDate: fromDbDate(r.dueDate),
    ruleDate: r.ruleDate ? fromDbDate(r.ruleDate) : null,
    status: r.status,
    category: r.category,
    account: r.account,
    creditCard: r.creditCard,
    recurringRuleId: r.recurringRuleId,
    transactionId: r.transactionId,
    derived: null,
    sourceId: null,
  };
}

async function findItem(db: DbClient, userId: string, id: string) {
  const item = await db.scheduledItem.findFirst({ where: { id, userId } });
  if (!item) throw notFound('Ocurrencia no encontrada.');
  return item;
}

const readItem = async (db: DbClient, userId: string, id: string) =>
  toScheduledDTO(
    await db.scheduledItem.findFirstOrThrow({ where: { id, userId }, include: itemInclude }),
  );

/** Vencimientos calculados de tarjetas (pago del mes) y préstamos (cuota pendiente): solo lectura. */
async function derivedItems(
  db: DbClient,
  auth: AuthContext,
  from: IsoDate | undefined,
  to: IsoDate,
): Promise<ScheduledItemDTO[]> {
  const [cards, debts] = await Promise.all([
    listCreditCards(db, auth.userId, auth.today),
    listDebts(db, auth.userId, auth.today),
  ]);
  const inRange = (d: IsoDate) => d <= to && (!from || d >= from);
  const empty = {
    kind: 'EXPENSE' as const,
    ruleDate: null,
    status: 'PENDING' as const,
    category: null,
    account: null,
    recurringRuleId: null,
    transactionId: null,
  };
  const cardItems = cards
    .filter((c) => c.isActive && c.amountDue > 0 && inRange(c.dueDate))
    .map((c): ScheduledItemDTO => ({
      ...empty,
      id: `card:${c.id}`,
      name: `Pago ${c.name}`,
      amount: c.amountDue,
      dueDate: c.dueDate,
      creditCard: { id: c.id, name: c.name, icon: c.icon, color: c.color, isActive: c.isActive },
      derived: 'CARD',
      sourceId: c.id,
    }));
  const loanItems = debts
    .filter(
      (d) => d.isActive && d.installmentDue > 0 && d.nextPaymentDate && inRange(d.nextPaymentDate),
    )
    .map((d): ScheduledItemDTO => ({
      ...empty,
      id: `loan:${d.id}`,
      name: `Cuota ${d.name}`,
      amount: d.installmentDue,
      dueDate: d.nextPaymentDate!,
      creditCard: null,
      derived: 'LOAN',
      sourceId: d.id,
    }));
  return [...cardItems, ...loanItems];
}

export async function listScheduled(
  db: PrismaClient,
  auth: AuthContext,
  q: ScheduledListQuery,
): Promise<ScheduledItemDTO[]> {
  await ensureScheduled(db, auth.userId, auth.today);
  const to = q.to ?? endOfMonth(addMonths(auth.today, 1));
  const statuses = q.status ?? ['PENDING'];
  const rows = await db.scheduledItem.findMany({
    where: {
      userId: auth.userId,
      status: { in: statuses },
      dueDate: { lte: toDbDate(to), ...(q.from && { gte: toDbDate(q.from) }) },
    },
    include: itemInclude,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });
  const items = rows.map(toScheduledDTO);
  if (statuses.includes('PENDING')) items.push(...(await derivedItems(db, auth, q.from, to)));
  return items.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

/** Obligación única o ingreso esperado (sin regla). */
export async function createScheduled(
  db: DbClient,
  auth: AuthContext,
  input: ScheduledCreateInput,
): Promise<ScheduledItemDTO> {
  await checkScheduleRefs(db, auth.userId, input);
  const item = await db.scheduledItem.create({
    data: {
      userId: auth.userId,
      kind: input.kind,
      name: input.name,
      amount: BigInt(input.amount),
      dueDate: toDbDate(input.dueDate),
      categoryId: input.categoryId,
      accountId: input.accountId,
      creditCardId: input.creditCardId,
    },
    include: itemInclude,
  });
  return toScheduledDTO(item);
}

export async function updateScheduled(
  db: DbClient,
  auth: AuthContext,
  id: string,
  input: ScheduledUpdateInput,
): Promise<ScheduledItemDTO> {
  const { userId } = auth;
  const item = await findItem(db, userId, id);
  if (item.status === 'DONE') {
    throw conflict('SCHEDULED_DONE', 'Ya está pagada: edita el movimiento enlazado.');
  }
  const editsFields = Object.keys(input).some((k) => k !== 'status');
  if (item.status === 'SKIPPED' && editsFields) {
    throw conflict('SCHEDULED_SKIPPED', 'Reabre la ocurrencia para editarla.');
  }
  const next = {
    kind: item.kind,
    categoryId: input.categoryId ?? item.categoryId,
    accountId: input.accountId !== undefined ? input.accountId : item.accountId,
    creditCardId: input.creditCardId !== undefined ? input.creditCardId : item.creditCardId,
  };
  const validShape =
    next.kind === 'INCOME'
      ? Boolean(next.accountId) && !next.creditCardId
      : Boolean(next.accountId) !== Boolean(next.creditCardId);
  if (!validShape) {
    throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
      accountId: 'Elige una cuenta o una tarjeta',
    });
  }
  if (input.categoryId || input.accountId || input.creditCardId) {
    await checkScheduleRefs(db, userId, next);
  }
  // Condicionada al estado leído: un completar concurrente no deja editar ni reabrir una DONE.
  const { count } = await db.scheduledItem.updateMany({
    where: { id, userId, status: item.status },
    data: {
      name: input.name,
      amount: input.amount !== undefined ? BigInt(input.amount) : undefined,
      dueDate: input.dueDate ? toDbDate(input.dueDate) : undefined,
      categoryId: input.categoryId,
      accountId: next.accountId,
      creditCardId: next.creditCardId,
      status: input.status,
    },
  });
  if (count !== 1) {
    throw conflict('SCHEDULED_DONE', 'La ocurrencia cambió de estado: vuelve a cargarla.');
  }
  return readItem(db, userId, id);
}

/** Spec 8.11: crea el movimiento real y marca la ocurrencia DONE, de forma atómica. */
export async function completeScheduled(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: ScheduledCompleteInput,
): Promise<TransactionResultDTO> {
  const { userId, today } = auth;
  const item = await findItem(db, userId, id);
  if (item.status !== 'PENDING') throw NOT_PENDING();
  if (item.kind === 'INCOME' && input.creditCardId) {
    throw badRequest('VALIDATION_ERROR', 'Un ingreso no puede llegar a una tarjeta.', {
      creditCardId: 'No aplica',
    });
  }
  const due = fromDbDate(item.dueDate);
  const accountId = input.accountId ?? (input.creditCardId ? null : item.accountId);
  const creditCardId = input.creditCardId ?? (input.accountId ? null : item.creditCardId);
  const base = {
    amount: input.amount ?? num(item.amount),
    date: input.date ?? (due > today ? today : due),
    description: input.description ?? item.name,
    payee: null,
    notes: null,
    tags: [],
  };
  const txInput: TransactionInput =
    item.kind === 'INCOME'
      ? { type: 'INCOME', ...base, accountId: accountId!, categoryId: item.categoryId }
      : creditCardId
        ? {
            type: 'CARD_PURCHASE',
            ...base,
            creditCardId,
            categoryId: item.categoryId,
            installments: 1,
          }
        : {
            type: 'EXPENSE',
            ...base,
            accountId: accountId!,
            categoryId: item.categoryId,
            paymentMethod: null,
          };
  const prepared = await prepareTransaction(db, auth, txInput);
  const transactionId = await db.$transaction(async (tx) => {
    // El primero en marcarla gana: una segunda petición simultánea no crea otro movimiento.
    const claimed = await tx.scheduledItem.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: { status: 'DONE' },
    });
    if (claimed.count !== 1) throw NOT_PENDING();
    const created = await insertTransaction(tx, userId, prepared);
    await tx.scheduledItem.updateMany({ where: { id, userId }, data: { transactionId: created } });
    return created;
  });
  return transactionResult(db, userId, transactionId, prepared);
}

export async function skipScheduled(
  db: DbClient,
  userId: string,
  id: string,
): Promise<ScheduledItemDTO> {
  const { count } = await db.scheduledItem.updateMany({
    where: { id, userId, status: 'PENDING' },
    data: { status: 'SKIPPED' },
  });
  if (count === 0) {
    await findItem(db, userId, id);
    throw NOT_PENDING();
  }
  return readItem(db, userId, id);
}

export async function deleteScheduled(db: DbClient, userId: string, id: string): Promise<void> {
  const item = await findItem(db, userId, id);
  if (item.recurringRuleId) {
    throw conflict(
      'USE_SKIP',
      'Esta ocurrencia es de una regla recurrente: omítela en lugar de eliminarla.',
    );
  }
  await db.scheduledItem.deleteMany({ where: { id, userId } });
}

/** Spec 8.11: "¿Es el pago de X?" — misma categoría, ±20 % del valor y ±7 días. */
export async function suggestScheduled(
  db: PrismaClient,
  auth: AuthContext,
  q: ScheduledSuggestionsQuery,
): Promise<ScheduledItemDTO[]> {
  await ensureScheduled(db, auth.userId, auth.today);
  const rows = await db.scheduledItem.findMany({
    where: {
      userId: auth.userId,
      status: 'PENDING',
      kind: q.kind,
      categoryId: q.categoryId,
      dueDate: { gte: toDbDate(addDays(q.date, -7)), lte: toDbDate(addDays(q.date, 7)) },
    },
    include: itemInclude,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });
  const distance = (r: ItemRow) => Math.abs(diffDays(q.date, fromDbDate(r.dueDate)));
  return rows
    .filter((r) => Math.abs(num(r.amount) - q.amount) <= 0.2 * num(r.amount))
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, 3)
    .map(toScheduledDTO);
}
