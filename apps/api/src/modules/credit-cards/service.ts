import {
  addMonths,
  formatCOP,
  type CardStatementDTO,
  type CreditCardCreateInput,
  type CreditCardDTO,
  type CreditCardUpdateInput,
  type DeleteResultDTO,
  type IsoDate,
} from '@finanzas/shared';
import {
  cardStatus,
  initialDebtCharge,
  upcomingInstallments,
  type CardBillingInput,
  type CardCharge,
  type CardTerms,
} from '../../domain/card-billing';
import { applyLedger } from '../../domain/ledger';
import type { CreditCard, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { conflict, entityDeleted, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { ledgerEntries } from '../ledger/repository';
import { cascadeSoftDelete } from '../planning/cascade';

export interface CardLedger {
  purchases: number;
  payments: number;
  charges: CardCharge[];
}

const NAME_TAKEN = () => conflict('CARD_NAME_TAKEN', 'Ya tienes una tarjeta con ese nombre.');

async function nameTaken(db: DbClient, userId: string, name: string) {
  const other = await db.creditCard.findUnique({
    where: { userId_name: { userId, name } },
    select: { isActive: true },
  });
  return other && !other.isActive
    ? conflict(
        'CARD_NAME_TAKEN',
        'Ya tienes una tarjeta eliminada con ese nombre. Restáurala desde Eliminados.',
      )
    : NAME_TAKEN();
}
const OLD_DATE = '1970-01-01';

/** Compras diferidas recientes una por una; compras de contado agrupadas por fecha; lo muy antiguo, en un total. */
export async function loadCardLedgers(
  db: DbClient,
  userId: string,
  today: IsoDate,
  cardIds?: string[],
  excludeIds: string[] = [],
) {
  const creditCardId = cardIds ? { in: cardIds } : { not: null };
  const notExcluded = excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {};
  const windowStart = toDbDate(addMonths(today, -50));
  const [totals, deferred, singles, old] = await Promise.all([
    db.transaction.groupBy({
      by: ['creditCardId', 'type'],
      where: { userId, creditCardId, ...notExcluded },
      _sum: { amount: true },
    }),
    db.transaction.findMany({
      where: {
        userId,
        creditCardId,
        ...notExcluded,
        type: 'CARD_PURCHASE',
        installments: { gt: 1 },
        date: { gte: windowStart },
      },
      select: { creditCardId: true, date: true, amount: true, installments: true },
    }),
    db.transaction.groupBy({
      by: ['creditCardId', 'date'],
      where: {
        userId,
        creditCardId,
        ...notExcluded,
        type: 'CARD_PURCHASE',
        installments: 1,
        date: { gte: windowStart },
      },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ['creditCardId'],
      where: {
        userId,
        creditCardId,
        ...notExcluded,
        type: 'CARD_PURCHASE',
        date: { lt: windowStart },
      },
      _sum: { amount: true },
    }),
  ]);

  const ledgers = new Map<string, CardLedger>();
  const get = (id: string) => {
    let ledger = ledgers.get(id);
    if (!ledger) {
      ledger = { purchases: 0, payments: 0, charges: [] };
      ledgers.set(id, ledger);
    }
    return ledger;
  };
  for (const t of totals) {
    if (!t.creditCardId) continue;
    if (t.type === 'CARD_PURCHASE') get(t.creditCardId).purchases += num(t._sum.amount);
    if (t.type === 'CARD_PAYMENT') get(t.creditCardId).payments += num(t._sum.amount);
  }
  for (const d of deferred) {
    get(d.creditCardId!).charges.push({
      date: fromDbDate(d.date),
      amount: num(d.amount),
      installments: d.installments!,
    });
  }
  for (const s of singles) {
    get(s.creditCardId!).charges.push({
      date: fromDbDate(s.date),
      amount: num(s._sum.amount),
      installments: 1,
    });
  }
  for (const o of old) {
    get(o.creditCardId!).charges.push({
      date: OLD_DATE,
      amount: num(o._sum.amount),
      installments: 1,
    });
  }
  return ledgers;
}

function billingOf(card: CreditCard, ledger: CardLedger | undefined) {
  const l = ledger ?? { purchases: 0, payments: 0, charges: [] };
  const terms: CardTerms = { statementDay: card.statementDay, paymentDueDay: card.paymentDueDay };
  const initialDebt = num(card.initialDebt);
  const initial = initialDebtCharge(
    {
      initialDebt,
      initialDebtInstallments: card.initialDebtInstallments,
      openingDate: fromDbDate(card.openingDate),
    },
    terms,
  );
  return {
    terms,
    charges: initial ? [initial, ...l.charges] : l.charges,
    debt: initialDebt + l.purchases - l.payments,
    payments: l.payments,
  };
}

export function toCreditCardDTO(
  card: CreditCard,
  ledger: CardLedger | undefined,
  today: IsoDate,
): CreditCardDTO {
  const b = billingOf(card, ledger);
  const status = cardStatus({
    terms: b.terms,
    charges: b.charges,
    totalPayments: b.payments,
    debt: b.debt,
    today,
  });
  const creditLimit = num(card.creditLimit);
  return {
    id: card.id,
    name: card.name,
    issuer: card.issuer,
    creditLimit,
    initialDebt: num(card.initialDebt),
    initialDebtInstallments: card.initialDebtInstallments,
    openingDate: fromDbDate(card.openingDate),
    statementDay: card.statementDay,
    paymentDueDay: card.paymentDueDay,
    icon: card.icon,
    color: card.color,
    isActive: card.isActive,
    sortOrder: card.sortOrder,
    debt: b.debt,
    available: creditLimit - b.debt,
    utilization: Math.max(b.debt, 0) / creditLimit,
    amountDue: status.amountDue,
    dueDate: status.lastDueDate,
    isOverdue: status.isOverdue,
    lastCutoff: status.lastCutoff,
    nextCutoff: status.nextCutoff,
    nextDueDate: status.nextDueDate,
    committed: status.committed,
  };
}

export async function findCreditCard(
  db: DbClient,
  userId: string,
  id: string,
): Promise<CreditCard> {
  const card = await db.creditCard.findUnique({ where: { id_userId: { id, userId } } });
  if (!card) throw notFound('Tarjeta no encontrada.');
  return card;
}

export async function cardDebt(
  db: DbClient,
  userId: string,
  card: CreditCard,
  excludeIds: string[] = [],
) {
  const totals = applyLedger(
    await ledgerEntries(db, userId, { creditCardId: card.id, excludeIds }),
  );
  return num(card.initialDebt) + (totals.cardDeltas.get(card.id) ?? 0);
}

export async function listCreditCards(
  db: DbClient,
  userId: string,
  today: IsoDate,
): Promise<CreditCardDTO[]> {
  const [cards, ledgers] = await Promise.all([
    db.creditCard.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    loadCardLedgers(db, userId, today),
  ]);
  return cards.map((c) => toCreditCardDTO(c, ledgers.get(c.id), today));
}

export async function getCreditCard(db: DbClient, userId: string, id: string, today: IsoDate) {
  const card = await findCreditCard(db, userId, id);
  const ledgers = await loadCardLedgers(db, userId, today, [id]);
  return toCreditCardDTO(card, ledgers.get(id), today);
}

export async function getCardStatement(
  db: DbClient,
  userId: string,
  id: string,
  today: IsoDate,
): Promise<CardStatementDTO> {
  const card = await findCreditCard(db, userId, id);
  const ledger = (await loadCardLedgers(db, userId, today, [id])).get(id);
  const dto = toCreditCardDTO(card, ledger, today);
  const b = billingOf(card, ledger);
  return { card: dto, upcoming: upcomingInstallments(b.charges, dto.lastCutoff, b.terms, 12) };
}

export async function createCreditCard(
  db: DbClient,
  auth: AuthContext,
  input: CreditCardCreateInput,
) {
  const sortOrder = await db.creditCard.count({ where: { userId: auth.userId } });
  try {
    const card = await db.creditCard.create({
      data: {
        userId: auth.userId,
        name: input.name,
        issuer: input.issuer,
        creditLimit: BigInt(input.creditLimit),
        initialDebt: BigInt(input.initialDebt),
        initialDebtInstallments: input.initialDebtInstallments,
        openingDate: toDbDate(input.openingDate ?? auth.today),
        statementDay: input.statementDay,
        paymentDueDay: input.paymentDueDay,
        icon: input.icon,
        color: input.color,
        sortOrder,
      },
    });
    return toCreditCardDTO(card, undefined, auth.today);
  } catch (err) {
    if (isUniqueViolation(err)) throw await nameTaken(db, auth.userId, input.name);
    throw err;
  }
}

export async function updateCreditCard(
  db: DbClient,
  auth: AuthContext,
  id: string,
  input: CreditCardUpdateInput,
) {
  const card = await findCreditCard(db, auth.userId, id);
  if (!card.isActive) throw entityDeleted(card.name, 'editarla');
  try {
    await db.creditCard.update({
      where: { id_userId: { id, userId: auth.userId } },
      data: {
        name: input.name,
        issuer: input.issuer,
        creditLimit: input.creditLimit !== undefined ? BigInt(input.creditLimit) : undefined,
        initialDebt: input.initialDebt !== undefined ? BigInt(input.initialDebt) : undefined,
        initialDebtInstallments: input.initialDebtInstallments,
        openingDate: input.openingDate ? toDbDate(input.openingDate) : undefined,
        statementDay: input.statementDay,
        paymentDueDay: input.paymentDueDay,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw await nameTaken(db, auth.userId, input.name ?? card.name);
    throw err;
  }
  return getCreditCard(db, auth.userId, id, auth.today);
}

export async function deleteCreditCard(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
): Promise<DeleteResultDTO> {
  const { userId } = auth;
  const card = await findCreditCard(db, userId, id);
  if (!card.isActive) return { deleted: 'soft' };
  const debt = await cardDebt(db, userId, card);
  if (debt !== 0) {
    throw conflict(
      'CARD_HAS_DEBT',
      debt > 0
        ? `La tarjeta tiene una deuda de ${formatCOP(debt)}. Págala o corrige la deuda inicial antes de eliminarla.`
        : `La tarjeta tiene un saldo a favor de ${formatCOP(-debt)}. Déjala en $0 antes de eliminarla.`,
    );
  }
  const counts = await Promise.all([
    db.transaction.count({ where: { userId, creditCardId: id } }),
    db.recurringRule.count({ where: { userId, creditCardId: id } }),
    db.scheduledItem.count({ where: { userId, creditCardId: id } }),
  ]);
  if (counts.every((c) => c === 0)) {
    await db.creditCard.delete({ where: { id_userId: { id, userId } } });
    return { deleted: 'hard' };
  }
  await db.$transaction(async (tx) => {
    await tx.creditCard.update({ where: { id_userId: { id, userId } }, data: { isActive: false } });
    await cascadeSoftDelete(tx, userId, { creditCardId: id }, auth.today);
  });
  return { deleted: 'soft' };
}

export async function restoreCreditCard(db: DbClient, auth: AuthContext, id: string) {
  await findCreditCard(db, auth.userId, id);
  await db.creditCard.update({
    where: { id_userId: { id, userId: auth.userId } },
    data: { isActive: true },
  });
  return getCreditCard(db, auth.userId, id, auth.today);
}

/** Estado de cada tarjeta y su entrada de facturación, para simular pagos futuros (spec 8.7). */
export async function cardBillings(
  db: DbClient,
  userId: string,
  today: IsoDate,
  excludeIds: string[] = [],
): Promise<Array<{ card: CreditCardDTO; billing: CardBillingInput }>> {
  const [cards, ledgers] = await Promise.all([
    db.creditCard.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    loadCardLedgers(db, userId, today, undefined, excludeIds),
  ]);
  return cards.map((c) => {
    const ledger = ledgers.get(c.id);
    const b = billingOf(c, ledger);
    return {
      card: toCreditCardDTO(c, ledger, today),
      billing: {
        terms: b.terms,
        charges: b.charges,
        totalPayments: b.payments,
        debt: b.debt,
        today,
      },
    };
  });
}
