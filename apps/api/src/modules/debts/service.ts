import {
  endOfMonth,
  startOfMonth,
  type DebtCreateInput,
  type DebtDTO,
  type DebtUpdateInput,
  type IsoDate,
} from '@finanzas/shared';
import { applyLedger } from '../../domain/ledger';
import { loanInstallmentDue, nextLoanPaymentDate } from '../../domain/loans';
import type { Debt, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, conflict, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { ledgerEntries } from '../ledger/repository';

export interface DebtLedger {
  disbursed: number;
  paid: number;
  paidThisMonth: number;
}

const NAME_TAKEN = () => conflict('DEBT_NAME_TAKEN', 'Ya tienes un préstamo con ese nombre.');

export async function loadDebtLedgers(
  db: DbClient,
  userId: string,
  today: IsoDate,
  debtIds?: string[],
) {
  const debtId = debtIds ? { in: debtIds } : { not: null };
  const month = { gte: toDbDate(startOfMonth(today)), lte: toDbDate(endOfMonth(today)) };
  const [totals, monthPayments, interests] = await Promise.all([
    db.transaction.groupBy({
      by: ['debtId', 'type'],
      where: { userId, debtId },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ['debtId'],
      where: { userId, debtId, type: 'DEBT_PAYMENT', date: month },
      _sum: { amount: true },
    }),
    db.transaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        date: month,
        parent: { is: { type: 'DEBT_PAYMENT', debtId } },
      },
      select: { amount: true, parent: { select: { debtId: true } } },
    }),
  ]);
  const ledgers = new Map<string, DebtLedger>();
  const get = (id: string) => {
    let ledger = ledgers.get(id);
    if (!ledger) {
      ledger = { disbursed: 0, paid: 0, paidThisMonth: 0 };
      ledgers.set(id, ledger);
    }
    return ledger;
  };
  for (const t of totals) {
    if (!t.debtId) continue;
    if (t.type === 'DEBT_DISBURSEMENT') get(t.debtId).disbursed += num(t._sum.amount);
    if (t.type === 'DEBT_PAYMENT') get(t.debtId).paid += num(t._sum.amount);
  }
  for (const p of monthPayments) if (p.debtId) get(p.debtId).paidThisMonth += num(p._sum.amount);
  for (const i of interests)
    if (i.parent?.debtId) get(i.parent.debtId).paidThisMonth += num(i.amount);
  return ledgers;
}

export function toDebtDTO(debt: Debt, ledger: DebtLedger | undefined, today: IsoDate): DebtDTO {
  const l = ledger ?? { disbursed: 0, paid: 0, paidThisMonth: 0 };
  const balance = num(debt.initialBalance) + l.disbursed - l.paid;
  const terms = {
    balance,
    monthlyPayment: debt.monthlyPayment != null ? num(debt.monthlyPayment) : null,
    paymentDay: debt.paymentDay,
    paidThisMonth: l.paidThisMonth,
    openingDate: fromDbDate(debt.openingDate),
  };
  return {
    id: debt.id,
    name: debt.name,
    lender: debt.lender,
    initialBalance: num(debt.initialBalance),
    openingDate: fromDbDate(debt.openingDate),
    monthlyPayment: terms.monthlyPayment,
    paymentDay: debt.paymentDay,
    icon: debt.icon,
    color: debt.color,
    isActive: debt.isActive,
    balance,
    installmentDue: loanInstallmentDue(terms, today, endOfMonth(today)),
    nextPaymentDate: nextLoanPaymentDate(terms, today),
  };
}

export async function findDebt(db: DbClient, userId: string, id: string): Promise<Debt> {
  const debt = await db.debt.findUnique({ where: { id_userId: { id, userId } } });
  if (!debt) throw notFound('Préstamo no encontrado.');
  return debt;
}

export async function loanBalance(
  db: DbClient,
  userId: string,
  debt: Debt,
  excludeIds: string[] = [],
) {
  const totals = applyLedger(await ledgerEntries(db, userId, { debtId: debt.id, excludeIds }));
  return num(debt.initialBalance) + (totals.loanDeltas.get(debt.id) ?? 0);
}

export async function listDebts(db: DbClient, userId: string, today: IsoDate): Promise<DebtDTO[]> {
  const [debts, ledgers] = await Promise.all([
    db.debt.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    loadDebtLedgers(db, userId, today),
  ]);
  return debts.map((d) => toDebtDTO(d, ledgers.get(d.id), today));
}

export async function getDebt(db: DbClient, userId: string, id: string, today: IsoDate) {
  const debt = await findDebt(db, userId, id);
  return toDebtDTO(debt, (await loadDebtLedgers(db, userId, today, [id])).get(id), today);
}

export async function createDebt(
  db: PrismaClient,
  auth: AuthContext,
  input: DebtCreateInput,
): Promise<DebtDTO> {
  const openingDate = input.openingDate ?? auth.today;
  if (input.receivedInAccountId) {
    if (openingDate > auth.today) {
      throw badRequest('FUTURE_DATE', 'La fecha no puede ser futura.', {
        openingDate: 'La fecha no puede ser futura',
      });
    }
    const account = await db.account.findUnique({
      where: { id_userId: { id: input.receivedInAccountId, userId: auth.userId } },
    });
    if (!account || !account.isActive) {
      throw badRequest('INVALID_REFERENCE', 'Revisa la cuenta seleccionada.', {
        receivedInAccountId: 'Cuenta no encontrada',
      });
    }
  }
  try {
    const debt = await db.$transaction(async (tx) => {
      const created = await tx.debt.create({
        data: {
          userId: auth.userId,
          name: input.name,
          lender: input.lender,
          initialBalance: BigInt(input.receivedInAccountId ? 0 : input.initialBalance),
          openingDate: toDbDate(openingDate),
          monthlyPayment: input.monthlyPayment != null ? BigInt(input.monthlyPayment) : null,
          paymentDay: input.paymentDay,
          icon: input.icon,
          color: input.color,
        },
      });
      if (input.receivedInAccountId) {
        await tx.transaction.create({
          data: {
            userId: auth.userId,
            type: 'DEBT_DISBURSEMENT',
            amount: BigInt(input.initialBalance),
            date: toDbDate(openingDate),
            accountId: input.receivedInAccountId,
            debtId: created.id,
            description: `Desembolso ${input.name}`,
          },
        });
      }
      return created;
    });
    return getDebt(db, auth.userId, debt.id, auth.today);
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function updateDebt(
  db: DbClient,
  auth: AuthContext,
  id: string,
  input: DebtUpdateInput,
) {
  const debt = await findDebt(db, auth.userId, id);
  if (input.isActive === false && debt.isActive) {
    const initialChange =
      input.initialBalance !== undefined ? input.initialBalance - num(debt.initialBalance) : 0;
    if ((await loanBalance(db, auth.userId, debt)) + initialChange !== 0) {
      throw conflict('DEBT_HAS_BALANCE', 'Solo puedes archivar un préstamo pagado por completo.');
    }
  }
  try {
    await db.debt.update({
      where: { id_userId: { id, userId: auth.userId } },
      data: {
        name: input.name,
        lender: input.lender,
        initialBalance:
          input.initialBalance !== undefined ? BigInt(input.initialBalance) : undefined,
        openingDate: input.openingDate ? toDbDate(input.openingDate) : undefined,
        monthlyPayment:
          input.monthlyPayment === undefined
            ? undefined
            : input.monthlyPayment === null
              ? null
              : BigInt(input.monthlyPayment),
        paymentDay: input.paymentDay,
        icon: input.icon,
        color: input.color,
        isActive: input.isActive,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
  return getDebt(db, auth.userId, id, auth.today);
}

export async function deleteDebt(db: DbClient, userId: string, id: string): Promise<void> {
  await findDebt(db, userId, id);
  if ((await db.transaction.count({ where: { userId, debtId: id } })) > 0) {
    throw conflict(
      'DEBT_IN_USE',
      'Este préstamo tiene movimientos. Archívalo en lugar de eliminarlo.',
    );
  }
  await db.debt.delete({ where: { id_userId: { id, userId } } });
}
