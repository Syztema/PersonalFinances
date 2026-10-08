import {
  DERIVED_METHODS,
  deriveMethod,
  endOfMonth,
  monthStartFromKey,
  roundShare,
  type AccountRefDTO,
  type AccountType,
  type CategoryRefDTO,
  type DerivedMethod,
  type IsoDate,
  type PaymentMethod,
  type RefDTO,
  type ReportDTO,
  type ReportPeriod,
} from '@finanzas/shared';
import { monthFlows, summarizeDebts } from './balances';
import { applyLedger, effectsOf, type LedgerEntry } from './ledger';

/** Movimiento (o suma de movimientos iguales del mismo día) que alimenta el reporte. */
export interface ReportEntry extends LedgerEntry {
  date: IsoDate;
  categoryId: string | null;
  paymentMethod: PaymentMethod | null;
}

export interface ReportInput {
  period: ReportPeriod;
  /** Todas las cuentas del usuario, activas o eliminadas, en el orden de la app. */
  accounts: Array<{ ref: AccountRefDTO; initialBalance: number }>;
  cards: Array<{ ref: RefDTO; initialDebt: number }>;
  loans: Array<{ id: string; initialBalance: number }>;
  /** Todas las categorías del usuario, activas o eliminadas, por id. */
  categories: Map<string, CategoryRefDTO>;
  /** Movimientos con fecha ≤ `to`; los anteriores a `from` solo alimentan los saldos de apertura. */
  entries: ReportEntry[];
}

/** Todo el reporte menos el presupuesto, que se calcula aparte (`budgetVsSpend`). */
export type ReportBody = Omit<ReportDTO, 'budget'>;
type CategoryRow = ReportDTO['expenseByCategory'][number];

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const isSpending = (e: ReportEntry) => e.type === 'EXPENSE' || e.type === 'CARD_PURCHASE';
const between = (entries: ReportEntry[], from: IsoDate, to: IsoDate) =>
  entries.filter((e) => e.date >= from && e.date <= to);
const addTo = (map: Map<string, number>, key: string, value: number) =>
  map.set(key, (map.get(key) ?? 0) + value);

/** Spec Fase 3 §3.2.2: una subcategoría suma en su principal; orden por valor y, en empate, por nombre. */
function byCategory(
  entries: ReportEntry[],
  categories: Map<string, CategoryRefDTO>,
  kind: 'INCOME' | 'EXPENSE',
): CategoryRow[] {
  const rows = new Map<string, { category: CategoryRefDTO; amount: number }>();
  for (const e of entries) {
    if (kind === 'INCOME' ? e.type !== 'INCOME' : !isSpending(e)) continue;
    const category = e.categoryId ? categories.get(e.categoryId) : undefined;
    if (!category) continue;
    const main = (category.parentId && categories.get(category.parentId)) || category;
    const row = rows.get(main.id) ?? { category: main, amount: 0 };
    row.amount += e.amount;
    rows.set(main.id, row);
  }
  const total = sum([...rows.values()].map((r) => r.amount));
  return [...rows.values()]
    .map((r) => ({ ...r, share: roundShare(r.amount / total) }))
    .sort((a, b) => b.amount - a.amount || a.category.name.localeCompare(b.category.name, 'es'));
}

/** Spec Fase 3 §3.2.5: gastos (`EXPENSE` + `CARD_PURCHASE`) por método derivado. */
function byMethod(
  entries: ReportEntry[],
  accountTypes: ReadonlyMap<string, AccountType>,
): ReportDTO['paymentMethods'] {
  const sums = new Map<DerivedMethod, number>();
  for (const e of entries) {
    if (!isSpending(e)) continue;
    const accountType = e.accountId ? (accountTypes.get(e.accountId) ?? null) : null;
    const method = deriveMethod(e.type, e.paymentMethod, accountType);
    if (method) sums.set(method, (sums.get(method) ?? 0) + e.amount);
  }
  const total = sum([...sums.values()]);
  return [...sums]
    .map(([method, amount]) => ({ method, amount, share: roundShare(amount / total) }))
    .sort(
      (a, b) =>
        b.amount - a.amount ||
        DERIVED_METHODS.indexOf(a.method) - DERIVED_METHODS.indexOf(b.method),
    );
}

/** Spec Fase 3 §3.2.3: saldo inicial (día anterior a `from`), entradas, salidas y saldo final. */
function accountRows(input: ReportInput, inPeriod: ReportEntry[]): ReportDTO['accounts'] {
  const before = applyLedger(input.entries.filter((e) => e.date < input.period.from)).accountDeltas;
  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  for (const e of inPeriod) {
    for (const fx of effectsOf(e).accounts) {
      if (fx.delta > 0) addTo(inflow, fx.accountId, fx.delta);
      else addTo(outflow, fx.accountId, -fx.delta);
    }
  }
  return input.accounts
    .map(({ ref, initialBalance }) => {
      const opening = initialBalance + (before.get(ref.id) ?? 0);
      const inn = inflow.get(ref.id) ?? 0;
      const out = outflow.get(ref.id) ?? 0;
      return { account: ref, opening, inflow: inn, outflow: out, closing: opening + inn - out };
    })
    .filter((r) => r.opening !== 0 || r.inflow !== 0 || r.outflow !== 0 || r.closing !== 0);
}

/** Spec Fase 3 §3.2.4: compras y pagos del periodo; deuda en `to` con la deuda inicial. */
function cardRows(input: ReportInput, inPeriod: ReportEntry[]): ReportDTO['cards'] {
  const debtDeltas = applyLedger(input.entries.filter((e) => e.date <= input.period.to)).cardDeltas;
  const purchases = new Map<string, number>();
  const payments = new Map<string, number>();
  for (const e of inPeriod) {
    if (!e.creditCardId) continue;
    if (e.type === 'CARD_PURCHASE') addTo(purchases, e.creditCardId, e.amount);
    if (e.type === 'CARD_PAYMENT') addTo(payments, e.creditCardId, e.amount);
  }
  return input.cards
    .map(({ ref, initialDebt }) => ({
      card: ref,
      purchases: purchases.get(ref.id) ?? 0,
      payments: payments.get(ref.id) ?? 0,
      closingDebt: initialDebt + (debtDeltas.get(ref.id) ?? 0),
    }))
    .filter((r) => r.purchases !== 0 || r.payments !== 0 || r.closingDebt !== 0);
}

/** Spec Fase 3 §3.2.6: dinero total, deudas, patrimonio y ahorro al cierre de `date`. */
function closingAt(input: ReportInput, date: IsoDate): ReportDTO['months'][number]['closing'] {
  const totals = applyLedger(input.entries.filter((e) => e.date <= date));
  const balances = input.accounts.map((a) => ({
    type: a.ref.type,
    balance: a.initialBalance + (totals.accountDeltas.get(a.ref.id) ?? 0),
  }));
  const totalMoney = sum(balances.map((b) => b.balance));
  // Igual que el dashboard: una tarjeta con saldo a favor no resta deuda.
  const debts = summarizeDebts(
    input.cards.map((c) => c.initialDebt + (totals.cardDeltas.get(c.ref.id) ?? 0)),
    input.loans.map((l) => l.initialBalance + (totals.loanDeltas.get(l.id) ?? 0)),
  ).total;
  const savingsBalance = sum(
    balances.filter((b) => b.type === 'SAVINGS' || b.type === 'INVESTMENT').map((b) => b.balance),
  );
  return { totalMoney, debts, netWorth: totalMoney - debts, savingsBalance };
}

/** Spec Fase 3 §3.2: reporte del periodo a partir de los saldos iniciales y los movimientos. */
export function buildReport(input: ReportInput): ReportBody {
  const { period } = input;
  const accountTypes = new Map(input.accounts.map((a) => [a.ref.id, a.ref.type]));
  const inPeriod = between(input.entries, period.from, period.to);
  const flows = monthFlows(inPeriod, accountTypes);
  return {
    period,
    totals: {
      ...flows,
      savingsRate: flows.income > 0 ? roundShare(flows.savings / flows.income) : null,
    },
    expenseByCategory: byCategory(inPeriod, input.categories, 'EXPENSE'),
    incomeByCategory: byCategory(inPeriod, input.categories, 'INCOME'),
    accounts: accountRows(input, inPeriod),
    cards: cardRows(input, inPeriod),
    paymentMethods: byMethod(inPeriod, accountTypes),
    months: period.months.map((month) => {
      const start = monthStartFromKey(month);
      const end = endOfMonth(start);
      const from = start > period.from ? start : period.from;
      const to = end < period.to ? end : period.to;
      return {
        month,
        ...monthFlows(between(input.entries, from, to), accountTypes),
        closing: closingAt(input, to),
      };
    }),
  };
}
