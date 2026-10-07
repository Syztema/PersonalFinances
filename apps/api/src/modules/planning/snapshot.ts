import {
  addDays,
  endOfMonth,
  isLiquidAccount,
  monthKey,
  SYSTEM_CATEGORY_KEYS,
  startOfMonth,
  type AccountDTO,
  type BreakdownItem,
  type CreditCardDTO,
  type DebtDTO,
  type IsoDate,
} from '@finanzas/shared';
import { estimateAvailable } from '../../domain/available';
import {
  monthFlows,
  projectedIncome,
  summarizeMoney,
  type MoneySummary,
  type MonthFlows,
} from '../../domain/balances';
import { savingsReserve } from '../../domain/savings';
import { spendingPower, type SpendingPowerResult } from '../../domain/spending-power';
import type { FinancialConfiguration, Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import type { AuthContext } from '../../types/fastify';
import { listAccounts } from '../accounts/service';
import { computeBudget, type BudgetComputation } from '../budgets/service';
import { cardBillings } from '../credit-cards/service';
import { debtsWithTerms } from '../debts/service';
import { ledgerEntries } from '../ledger/repository';
import { ensureScheduled } from '../recurring/service';

export interface PendingItem {
  id: string;
  name: string;
  dueDate: IsoDate;
  amount: number;
  categoryId: string;
}

export interface PlanningSnapshot {
  today: IsoDate;
  config: FinancialConfiguration;
  accounts: AccountDTO[];
  money: MoneySummary;
  flows: MonthFlows;
  cards: CreditCardDTO[];
  loans: DebtDTO[];
  /** Obligaciones PENDING hasta fin de mes (o hoy + 3 si es más tarde), incluidas las vencidas. */
  obligations: PendingItem[];
  /** Ingresos esperados PENDING en el mismo horizonte. */
  incomes: PendingItem[];
  budget: BudgetComputation;
  available: { total: number; breakdown: BreakdownItem[] };
  projectedIncome: number;
  spendingPower: SpendingPowerResult;
  /** Gasto discrecional del mes hasta hoy (incluye hoy). */
  discretionaryMonth: number;
}

/** Spec 8.7: gastos discrecionales = sin hijo de préstamo, sin enlace a una ocurrencia y sin ajustes de saldo. */
const discretionary = (
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Prisma.TransactionWhereInput => ({
  userId,
  type: { in: ['EXPENSE', 'CARD_PURCHASE'] },
  parentId: null,
  scheduledItem: { is: null },
  // Un ajuste de saldo corrige el saldo real: no es gasto de hoy.
  category: {
    OR: [{ systemKey: null }, { systemKey: { not: SYSTEM_CATEGORY_KEYS.ADJUSTMENT_EXPENSE } }],
  },
  date: { gte: toDbDate(from), lte: toDbDate(to) },
});

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);

export async function loadPlanning(db: PrismaClient, auth: AuthContext): Promise<PlanningSnapshot> {
  const { userId, today } = auth;
  await ensureScheduled(db, userId, today);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const soon = addDays(today, 3);
  const horizon = soon > monthEnd ? soon : monthEnd;

  const [config, accounts, monthEntries, cards, loans, pendingRows, budget, todayRows, monthSpend] =
    await Promise.all([
      db.financialConfiguration.findUniqueOrThrow({ where: { userId } }),
      listAccounts(db, userId),
      ledgerEntries(db, userId, { from: monthStart, to: monthEnd }),
      cardBillings(db, userId, today),
      debtsWithTerms(db, userId, today),
      db.scheduledItem.findMany({
        where: { userId, status: 'PENDING', dueDate: { lte: toDbDate(horizon) } },
        select: { id: true, kind: true, name: true, dueDate: true, amount: true, categoryId: true },
        orderBy: { dueDate: 'asc' },
      }),
      computeBudget(db, auth, monthKey(today)),
      db.transaction.findMany({
        where: discretionary(userId, today, today),
        select: { id: true, type: true, amount: true, accountId: true, categoryId: true },
      }),
      db.transaction.aggregate({
        where: discretionary(userId, monthStart, today),
        _sum: { amount: true },
      }),
    ]);

  const money = summarizeMoney(accounts);
  const accountTypes = new Map(accounts.map((a) => [a.id, a.type]));
  const flows = monthFlows(monthEntries, accountTypes);
  const reserveOf = (savingsFlow: number, investmentFlow: number) =>
    savingsReserve({
      savingsPct: config.savingsPct,
      investmentPct: config.investmentPct,
      incomeReceived: flows.income,
      savingsFlow,
      investmentFlow,
    });
  const reserve = reserveOf(flows.savings, flows.investment);
  const toItem = (r: (typeof pendingRows)[number]): PendingItem => ({
    id: r.id,
    name: r.name,
    dueDate: fromDbDate(r.dueDate),
    amount: num(r.amount),
    categoryId: r.categoryId,
  });
  const obligations = pendingRows.filter((r) => r.kind === 'EXPENSE').map(toItem);
  const incomes = pendingRows.filter((r) => r.kind === 'INCOME').map(toItem);
  const thisMonth = (x: PendingItem) => x.dueDate <= monthEnd;

  const available = estimateAvailable({
    liquid: money.liquid,
    pendingObligations: sum(obligations.filter(thisMonth).map((o) => o.amount)),
    cardsCommitted: sum(cards.map((c) => c.card.committed)),
    loansDue: sum(loans.map((l) => l.debt.installmentDue)),
    reserve,
  });
  const income = projectedIncome(
    flows.income,
    sum(incomes.filter((x) => x.dueDate >= monthStart && thisMonth(x)).map((x) => x.amount)),
    config.monthlyIncomeEstimate != null ? num(config.monthlyIncomeEstimate) : null,
  );

  // Base del día (spec 8.7): sin los gastos discrecionales de hoy.
  const liquidIds = new Set(accounts.filter((a) => isLiquidAccount(a.type)).map((a) => a.id));
  const spentToday = sum(todayRows.map((t) => num(t.amount)));
  const liquidAddBack = sum(
    todayRows
      .filter((t) => t.type === 'EXPENSE' && t.accountId !== null && liquidIds.has(t.accountId))
      .map((t) => num(t.amount)),
  );
  // R0 de la base del día: los gastos de hoy desde ahorro o inversión no cuentan dos veces.
  const todayFrom = (type: string) =>
    sum(
      todayRows
        .filter(
          (t) =>
            t.type === 'EXPENSE' && t.accountId !== null && accountTypes.get(t.accountId) === type,
        )
        .map((t) => num(t.amount)),
    );
  const reserveBase = reserveOf(
    flows.savings + todayFrom('SAVINGS'),
    flows.investment + todayFrom('INVESTMENT'),
  );
  const todayCardIds = todayRows.filter((t) => t.type === 'CARD_PURCHASE').map((t) => t.id);
  const baseCards =
    todayCardIds.length > 0 ? await cardBillings(db, userId, today, todayCardIds) : cards;

  // Plan, decisiones 1 y 2: el límite por presupuesto usa su alcance y excluye lo discrecional de hoy.
  const inScope = (categoryId: string | null) =>
    budget.scope === null || (categoryId !== null && budget.scope.has(categoryId));
  const total = budget.dto.total;
  const power = spendingPower({
    today,
    liquidBase: money.liquid + liquidAddBack,
    reserve: reserveBase,
    savingsPct: config.savingsPct,
    investmentPct: config.investmentPct,
    expectedIncomes: incomes.map((x) => ({ date: x.dueDate, amount: x.amount })),
    obligations: obligations.map((o) => ({ date: o.dueDate, amount: o.amount })),
    cards: baseCards.map((c) => c.billing),
    loans: loans.map((l) => l.terms),
    budget: total
      ? {
          amount: total.budget,
          spentBase:
            total.spent -
            sum(todayRows.filter((t) => inScope(t.categoryId)).map((t) => num(t.amount))),
          pendingObligations: sum(
            obligations.filter((o) => thisMonth(o) && inScope(o.categoryId)).map((o) => o.amount),
          ),
        }
      : null,
    spentToday,
  });

  return {
    today,
    config,
    accounts,
    money,
    flows,
    cards: cards.map((c) => c.card),
    loans: loans.map((l) => l.debt),
    obligations,
    incomes,
    budget,
    available,
    projectedIncome: income,
    spendingPower: power,
    discretionaryMonth: num(monthSpend._sum.amount),
  };
}
