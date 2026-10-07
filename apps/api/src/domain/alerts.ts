import {
  dayOfMonth,
  daysInMonth,
  diffDays,
  endOfMonth,
  formatCOP,
  monthKey,
  yearMonth,
  type AlertDTO,
  type AlertLevel,
  type IsoDate,
  type StatusDTO,
} from '@finanzas/shared';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `05 oct` (spec 8.14). */
export function shortDate(date: IsoDate): string {
  const { month } = yearMonth(date);
  return `${String(dayOfMonth(date)).padStart(2, '0')} ${MONTHS[month - 1]!}`;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface UnusualExpense {
  id: string;
  categoryName: string;
  description: string | null;
  amount: number;
}

/** Spec 8.12: más de 3 × la mediana de su categoría en los 90 días previos, con al menos 5 datos. */
export function unusualExpenses(
  recent: Array<UnusualExpense & { categoryId: string }>,
  history: ReadonlyMap<string, number[]>,
): UnusualExpense[] {
  return recent
    .filter((r) => {
      const values = history.get(r.categoryId) ?? [];
      return values.length >= 5 && r.amount > 3 * median(values);
    })
    .map((r) => ({
      id: r.id,
      categoryName: r.categoryName,
      description: r.description,
      amount: r.amount,
    }));
}

export interface BudgetUsage {
  budget: number;
  spent: number;
}

export interface AlertsInput {
  today: IsoDate;
  /** Sin cuentas no se avisa "dinero bajo" (usuario nuevo). */
  hasAccounts: boolean;
  budget: {
    total: BudgetUsage | null;
    lines: Array<BudgetUsage & { categoryId: string; name: string }>;
  };
  /** Objetivo de ahorro del mes (% × ingreso proyectado) y ahorro real. */
  savings: { target: number; actual: number };
  cards: Array<{
    id: string;
    name: string;
    utilization: number;
    amountDue: number;
    dueDate: IsoDate;
    isOverdue: boolean;
  }>;
  /** Obligaciones PENDING. */
  obligations: Array<{ id: string; name: string; dueDate: IsoDate; amount: number }>;
  /** Ingresos esperados PENDING. */
  expectedIncomes: Array<{ id: string; name: string; dueDate: IsoDate; amount: number }>;
  monthIncome: number;
  monthExpense: number;
  unusual: UnusualExpense[];
  available: number;
  lowBalanceThreshold: number;
  /** F(fin de mes) − gasto discrecional diario promedio × días restantes. */
  projectedEndBalance: number;
  negativeAccounts: Array<{ id: string; name: string; balance: number }>;
}

const LEVEL_ORDER: Record<AlertLevel, number> = { DANGER: 0, WARNING: 1, INFO: 2 };
const BUDGET_STEPS: Array<[number, AlertLevel]> = [
  [1, 'DANGER'],
  [0.9, 'WARNING'],
  [0.75, 'WARNING'],
  [0.5, 'INFO'],
];
const pct = (v: number) => `${Math.round(v * 100)} %`;
const when = (days: number, date: IsoDate) =>
  days === 0 ? 'hoy' : days === 1 ? 'mañana' : `el ${shortDate(date)}`;

function budgetAlert(month: string, id: string, label: string, u: BudgetUsage): AlertDTO | null {
  if (u.budget <= 0) return null;
  const usage = u.spent / u.budget;
  const step = BUDGET_STEPS.find(([threshold]) => usage >= threshold);
  if (!step) return null;
  const [threshold, level] = step;
  return {
    key: `budget:${month}:${id}:${Math.round(threshold * 100)}`,
    level,
    title:
      threshold >= 1
        ? `Superaste el presupuesto${label}`
        : `Llevas el ${pct(usage)} del presupuesto${label}`,
    message: `Has gastado ${formatCOP(u.spent)} de ${formatCOP(u.budget)}.`,
    href: '/budgets',
  };
}

export function computeAlerts(i: AlertsInput): AlertDTO[] {
  const month = monthKey(i.today);
  const { year, month: m } = yearMonth(i.today);
  const out: AlertDTO[] = [];
  const add = (a: AlertDTO | null) => {
    if (a) out.push(a);
  };

  if (i.budget.total) add(budgetAlert(month, 'total', '', i.budget.total));
  for (const line of i.budget.lines)
    add(budgetAlert(month, line.categoryId, ` de ${line.name}`, line));

  if (
    dayOfMonth(i.today) > daysInMonth(year, m) / 2 &&
    i.savings.target > 0 &&
    i.savings.actual < i.savings.target / 2
  ) {
    add({
      key: `savings:${month}`,
      level: 'WARNING',
      title: 'Tu ahorro va por debajo del objetivo',
      message: `Llevas ${formatCOP(i.savings.actual)} de ${formatCOP(i.savings.target)} este mes.`,
      href: '/settings',
    });
  }

  for (const c of i.cards) {
    if (c.utilization >= 0.95 || c.utilization >= 0.8) {
      const high = c.utilization >= 0.95;
      add({
        key: `card-limit:${month}:${c.id}:${high ? 95 : 80}`,
        level: high ? 'DANGER' : 'WARNING',
        title: `${c.name} está cerca del límite`,
        message: `Usas el ${pct(c.utilization)} del cupo.`,
        href: `/cards/${c.id}`,
      });
    }
    if (c.amountDue <= 0) continue;
    const days = diffDays(i.today, c.dueDate);
    if (c.isOverdue) {
      add({
        key: `card-overdue:${c.id}:${c.dueDate}`,
        level: 'DANGER',
        title: `El pago de ${c.name} está vencido`,
        message: `Debías pagar ${formatCOP(c.amountDue)} el ${shortDate(c.dueDate)}.`,
        href: `/cards/${c.id}`,
      });
    } else if (days >= 0 && days <= 5) {
      add({
        key: `card-due:${c.id}:${c.dueDate}`,
        level: 'WARNING',
        title: `El pago de ${c.name} vence ${when(days, c.dueDate)}`,
        message: `Pago del mes: ${formatCOP(c.amountDue)}.`,
        href: `/cards/${c.id}`,
      });
    }
  }

  for (const o of i.obligations) {
    const days = diffDays(i.today, o.dueDate);
    if (days < 0) {
      add({
        key: `obligation-overdue:${o.id}:${o.dueDate}`,
        level: 'DANGER',
        title: `${o.name} está vencida`,
        message: `Vencía el ${shortDate(o.dueDate)}: ${formatCOP(o.amount)}.`,
        href: '/recurring',
      });
    } else if (days <= 3) {
      add({
        key: `obligation-due:${o.id}:${o.dueDate}`,
        level: 'WARNING',
        title: `${o.name} vence ${when(days, o.dueDate)}`,
        message: `${formatCOP(o.amount)}.`,
        href: '/recurring',
      });
    }
  }

  if (i.monthExpense > i.monthIncome) {
    add({
      key: `overspend:${month}`,
      level: 'WARNING',
      title: 'Gastas más de lo que ganas este mes',
      message: `Gastos ${formatCOP(i.monthExpense)} · Ingresos ${formatCOP(i.monthIncome)}.`,
      href: '/transactions',
    });
  }

  for (const u of i.unusual) {
    add({
      key: `unusual:${u.id}`,
      level: 'INFO',
      title: `Gasto inusual en ${u.categoryName}`,
      message: `${u.description ?? 'Un movimiento'} de ${formatCOP(u.amount)} supera 3 veces lo normal en esa categoría.`,
      href: '/transactions',
    });
  }

  if (i.hasAccounts && i.available < i.lowBalanceThreshold) {
    add({
      key: `low-balance:${i.today}`,
      level: 'WARNING',
      title: 'Tu dinero disponible está bajo',
      message: `Disponible estimado: ${formatCOP(i.available)}.`,
      href: null,
    });
  }

  if (i.projectedEndBalance < 0) {
    add({
      key: `projection:${month}`,
      level: 'DANGER',
      title: 'A este ritmo terminarás el mes en negativo',
      message: `Proyección a fin de mes: ${formatCOP(i.projectedEndBalance)}.`,
      href: null,
    });
  }

  for (const x of i.expectedIncomes) {
    if (x.dueDate >= i.today) continue;
    add({
      key: `income-late:${x.id}:${x.dueDate}`,
      level: 'INFO',
      title: `¿Ya recibiste ${x.name}?`,
      message: `Esperabas ${formatCOP(x.amount)} el ${shortDate(x.dueDate)}. Márcalo como recibido u omítelo.`,
      href: '/recurring',
    });
  }

  for (const a of i.negativeAccounts) {
    add({
      key: `negative-balance:${a.id}:${month}`,
      level: 'WARNING',
      title: `${a.name} tiene saldo negativo`,
      message: `Saldo: ${formatCOP(a.balance)}.`,
      href: '/accounts',
    });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export interface StatusInput {
  today: IsoDate;
  /** Presupuesto general del mes (o Σ de líneas) con lo gastado en su alcance; null si no hay. */
  budget: { budget: number; spent: number; projectedSpend: number } | null;
  monthExpense: number;
  projectedIncome: number;
  projectionNegative: boolean;
}

/** Spec 8.12 "Estado general". */
export function overallStatus(i: StatusInput): StatusDTO {
  const { year, month } = yearMonth(i.today);
  const progress = dayOfMonth(i.today) / daysInMonth(year, month);
  const daysLeft = diffDays(i.today, endOfMonth(i.today)) + 1;
  const usage = i.budget
    ? i.budget.budget > 0
      ? i.budget.spent / i.budget.budget
      : null
    : i.projectedIncome > 0
      ? i.monthExpense / i.projectedIncome
      : null;
  const left = daysLeft === 1 ? 'queda 1 día' : `quedan ${daysLeft} días`;
  const message =
    usage === null
      ? 'Registra tus ingresos y gastos para ver cómo vas este mes.'
      : i.budget
        ? `Has utilizado el ${pct(usage)} de tu presupuesto y ${left}.`
        : `Has gastado el ${pct(usage)} de tu ingreso del mes y ${left}.`;

  if ((usage !== null && usage >= 0.9) || i.projectionNegative) {
    return { level: 'DANGER', title: 'Debes controlar tus gastos', message };
  }
  if (
    (usage !== null && (usage >= 0.75 || usage > progress + 0.1)) ||
    (i.budget !== null && i.budget.projectedSpend > i.budget.budget)
  ) {
    return { level: 'WARNING', title: 'Cuidado', message };
  }
  return { level: 'OK', title: 'Vas bien', message };
}
