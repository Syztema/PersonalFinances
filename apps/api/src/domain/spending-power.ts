import {
  addDays,
  diffDays,
  endOfMonth,
  type BreakdownItem,
  type IsoDate,
  type SpendingPowerDTO,
} from '@finanzas/shared';
import { minus } from './available';
import { cardStatus, exigibleAt, type CardBillingInput } from './card-billing';
import { loanInstallmentDue, type LoanTerms } from './loans';
import { pctOf } from './savings';

export interface DatedAmount {
  date: IsoDate;
  amount: number;
}

export interface SpendingPowerInput {
  today: IsoDate;
  /** Dinero líquido sin los gastos discrecionales de hoy (base del día). */
  liquidBase: number;
  /** R0: ahorro e inversión por separar de lo ya recibido (spec 8.5). */
  reserve: number;
  savingsPct: number;
  investmentPct: number;
  /** Ingresos esperados PENDING; solo cuentan los de hoy < fecha ≤ t. */
  expectedIncomes: DatedAmount[];
  /** Obligaciones PENDING con fecha ≤ fin de mes (incluye vencidas). */
  obligations: DatedAmount[];
  /** Tarjetas sin las compras discrecionales de hoy. */
  cards: CardBillingInput[];
  loans: LoanTerms[];
  /** null si el mes no tiene presupuesto. */
  budget: { amount: number; spentBase: number; pendingObligations: number } | null;
  spentToday: number;
}

export interface SpendingPowerResult extends SpendingPowerDTO {
  /** F(fin de mes): para la alerta de proyección negativa. */
  endOfMonthBalance: number;
}

interface Terms {
  liquid: number;
  reserve: number;
  incomes: number;
  obligations: number;
  cards: number;
  loans: number;
}

const floor100 = (v: number) => Math.floor(v / 100) * 100;
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const balanceOf = (x: Terms) =>
  x.liquid - x.reserve + x.incomes - x.obligations - x.cards - x.loans;

function termsAt(i: SpendingPowerInput, t: IsoDate, monthEnd: IsoDate): Terms {
  const incoming = sum(
    i.expectedIncomes.filter((x) => x.date > i.today && x.date <= t).map((x) => x.amount),
  );
  return {
    liquid: i.liquidBase,
    reserve: i.reserve,
    incomes: incoming - pctOf(incoming, i.savingsPct + i.investmentPct),
    obligations: sum(i.obligations.filter((x) => x.date <= t).map((x) => x.amount)),
    cards: sum(i.cards.map((c) => (t < monthEnd ? exigibleAt(c, t) : cardStatus(c).committed))),
    loans: sum(i.loans.map((l) => loanInstallmentDue(l, i.today, t))),
  };
}

const REASONS = {
  obligations: 'Tus obligaciones pendientes del mes no dejan margen.',
  cards: 'Los pagos de tus tarjetas no dejan margen.',
  loans: 'Las cuotas de tus préstamos no dejan margen.',
  reserve: 'Lo que debes separar para ahorro e inversión no deja margen.',
} as const;

/** Spec 8.7: "el término que más resta". */
function mainReason(x: Terms): string {
  const candidates: Array<[keyof typeof REASONS, number]> = [
    ['obligations', x.obligations],
    ['cards', x.cards],
    ['loans', x.loans],
    ['reserve', x.reserve],
  ];
  const [key, amount] = candidates.reduce((a, b) => (b[1] > a[1] ? b : a));
  return amount > 0 ? REASONS[key] : 'No tienes dinero disponible en tus cuentas.';
}

function liquidityItems(x: Terms): BreakdownItem[] {
  return [
    { key: 'liquid', label: 'Dinero líquido', amount: x.liquid },
    { key: 'reserve', label: 'Ahorro e inversión por separar', amount: minus(x.reserve) },
    { key: 'incomes', label: 'Ingresos esperados (sin el % de ahorro)', amount: x.incomes },
    { key: 'obligations', label: 'Obligaciones pendientes', amount: minus(x.obligations) },
    { key: 'cards', label: 'Pagos de tarjetas', amount: minus(x.cards) },
    { key: 'loans', label: 'Cuotas de préstamos', amount: minus(x.loans) },
  ];
}

export function spendingPower(i: SpendingPowerInput): SpendingPowerResult {
  const monthEnd = endOfMonth(i.today);
  const daysLeft = diffDays(i.today, monthEnd) + 1;

  let binding: { date: IsoDate; days: number; terms: Terms; daily: number } | null = null;
  let endOfMonthBalance = 0;
  for (let t = i.today; t <= monthEnd; t = addDays(t, 1)) {
    const terms = termsAt(i, t, monthEnd);
    const days = diffDays(i.today, t) + 1;
    const daily = balanceOf(terms) / days;
    if (!binding || daily < binding.daily) binding = { date: t, days, terms, daily };
    if (t === monthEnd) endOfMonthBalance = balanceOf(terms);
  }
  const b = binding!;

  const budgetRaw = i.budget
    ? Math.max(0, i.budget.amount - i.budget.spentBase - i.budget.pendingObligations) / daysLeft
    : null;
  const daily = floor100(Math.max(0, Math.min(b.daily, budgetRaw ?? Infinity)));
  const limitedBy = budgetRaw !== null && budgetRaw < b.daily ? 'BUDGET' : 'LIQUIDITY';
  const reason =
    daily > 0
      ? null
      : limitedBy === 'BUDGET'
        ? 'Tu presupuesto del mes no deja margen para hoy.'
        : mainReason(b.terms);

  return {
    daily,
    spentToday: i.spentToday,
    remainingToday: daily - i.spentToday,
    limitedBy,
    reason,
    breakdown: {
      liquidity: {
        daily: floor100(Math.max(0, b.daily)),
        bindingDate: b.date,
        days: b.days,
        items: liquidityItems(b.terms),
      },
      budget:
        i.budget && budgetRaw !== null
          ? {
              daily: floor100(budgetRaw),
              days: daysLeft,
              items: [
                { key: 'budget', label: 'Presupuesto del mes', amount: i.budget.amount },
                { key: 'spent', label: 'Ya gastado este mes', amount: minus(i.budget.spentBase) },
                {
                  key: 'obligations',
                  label: 'Obligaciones pendientes del mes',
                  amount: minus(i.budget.pendingObligations),
                },
              ],
            }
          : null,
    },
    endOfMonthBalance,
  };
}
