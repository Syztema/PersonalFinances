import type { IsoDate } from './dates';
import type {
  AccountType,
  Bucket,
  CategoryKind,
  DerivedMethod,
  Frequency,
  GoalStatus,
  PaymentMethod,
  ScheduledKind,
  ScheduledStatus,
  Theme,
  TransactionType,
} from './enums';

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  theme: Theme;
  timezone: string;
  createdAt: string;
}

export interface RefDTO {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** false si fue eliminada (la interfaz muestra "(eliminada)"). */
  isActive: boolean;
}
export interface AccountRefDTO extends RefDTO {
  type: AccountType;
}
export interface CategoryRefDTO extends RefDTO {
  kind: CategoryKind;
  parentId: string | null;
}

export interface AccountDTO {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  initialBalance: number;
  openingDate: IsoDate;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  balance: number;
}

export interface CategoryDTO {
  id: string;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  bucket: Bucket | null;
  icon: string;
  color: string;
  isSystem: boolean;
  systemKey: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface TagDTO {
  id: string;
  name: string;
  usageCount: number;
}

export interface CreditCardDTO {
  id: string;
  name: string;
  issuer: string | null;
  creditLimit: number;
  initialDebt: number;
  initialDebtInstallments: number;
  openingDate: IsoDate;
  statementDay: number;
  paymentDueDay: number;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  /** Puede ser negativa (saldo a favor). */
  debt: number;
  available: number;
  /** debt / creditLimit, mínimo 0. */
  utilization: number;
  /** Pago del mes estimado (≥ 0) y su fecha. */
  amountDue: number;
  dueDate: IsoDate;
  isOverdue: boolean;
  lastCutoff: IsoDate;
  nextCutoff: IsoDate;
  nextDueDate: IsoDate;
  /** Facturado + próximo corte − pagos (≥ 0). */
  committed: number;
}

export interface CardInstallmentDTO {
  cutoff: IsoDate;
  dueDate: IsoDate;
  amount: number;
}

export interface CardStatementDTO {
  card: CreditCardDTO;
  upcoming: CardInstallmentDTO[];
}

export interface DebtDTO {
  id: string;
  name: string;
  lender: string | null;
  initialBalance: number;
  openingDate: IsoDate;
  monthlyPayment: number | null;
  paymentDay: number | null;
  icon: string;
  color: string;
  isActive: boolean;
  balance: number;
  /** Cuota pendiente del mes en curso (≥ 0). */
  installmentDue: number;
  nextPaymentDate: IsoDate | null;
}

export interface TransactionDTO {
  id: string;
  type: TransactionType;
  amount: number;
  date: IsoDate;
  description: string | null;
  payee: string | null;
  notes: string | null;
  account: AccountRefDTO | null;
  toAccount: AccountRefDTO | null;
  creditCard: RefDTO | null;
  debt: RefDTO | null;
  category: CategoryRefDTO | null;
  goalId: string | null;
  installments: number | null;
  paymentMethod: PaymentMethod | null;
  method: DerivedMethod | null;
  parentId: string | null;
  /** Intereses (gasto hijo) de un DEBT_PAYMENT; 0 en otros tipos. */
  interest: number;
  tags: string[];
  createdAt: string;
}

export type WarningCode = 'NEGATIVE_BALANCE' | 'OVER_CREDIT_LIMIT' | 'BEFORE_OPENING_DATE';

export interface TransactionResultDTO {
  transaction: TransactionDTO;
  warnings: WarningCode[];
}

export interface BreakdownItem {
  key: string;
  label: string;
  amount: number;
}

export interface DashboardDTO {
  greetingName: string;
  today: IsoDate;
  month: string;
  money: {
    total: number;
    liquid: number;
    savings: number;
    investment: number;
    accounts: AccountDTO[];
  };
  available: { total: number; breakdown: BreakdownItem[] };
  debts: { cards: number; loans: number; total: number };
  netWorth: number;
  thisMonth: {
    income: number;
    expense: number;
    savings: number;
    investment: number;
    remaining: number;
    savingsRate: number | null;
    savingsTargetPct: number;
  };
  cards: CreditCardDTO[];
  loans: DebtDTO[];
  spendingPower: SpendingPowerDTO;
  status: StatusDTO;
  /** Las 3 alertas principales no descartadas. */
  alerts: AlertDTO[];
  /** Metas activas (máximo 3). */
  goals: GoalDTO[];
  budget: DashboardBudgetDTO | null;
}

export interface DeleteResultDTO {
  deleted: 'hard' | 'soft';
}

export interface AdjustBalanceResultDTO {
  transaction: TransactionDTO;
  account: AccountDTO;
}

export interface FinancialSettingsDTO {
  obligationsPct: number;
  savingsPct: number;
  investmentPct: number;
  leisurePct: number;
  otherPct: number;
  monthlyIncomeEstimate: number | null;
  lowBalanceThreshold: number;
}

export type BucketKey = 'OBLIGATIONS' | 'SAVINGS' | 'INVESTMENT' | 'LEISURE' | 'OTHER';

export interface BucketProgressDTO {
  key: BucketKey;
  label: string;
  pct: number;
  /** pct × ingreso proyectado del mes. */
  target: number;
  actual: number;
}

export interface FinancialSettingsResponse {
  settings: FinancialSettingsDTO;
  month: { key: string; projectedIncome: number; buckets: BucketProgressDTO[] };
}

export interface BudgetLineDTO {
  id: string;
  category: CategoryRefDTO;
  amount: number;
  spent: number;
  remaining: number;
  usage: number;
}

export interface BudgetDTO {
  month: string;
  totalAmount: number | null;
  lines: BudgetLineDTO[];
  /** null si el mes no tiene presupuesto. */
  total: { budget: number; spent: number; remaining: number; usage: number } | null;
  /** Solo en el mes en curso. */
  projection: { projectedSpend: number; exceedsOnDay: number | null } | null;
  daysLeft: number | null;
  /** Mes del que se copió en esta consulta, o null. */
  copiedFrom: string | null;
}

export interface GoalDTO {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: IsoDate | null;
  account: AccountRefDTO;
  initialAmount: number;
  status: GoalStatus;
  icon: string;
  color: string;
  contributed: number;
  withdrawn: number;
  progress: number;
  pct: number;
  remaining: number;
  monthlyNeeded: number | null;
  weeklyNeeded: number | null;
}

export interface RecurringRuleDTO {
  id: string;
  name: string;
  kind: ScheduledKind;
  amount: number;
  category: CategoryRefDTO;
  account: AccountRefDTO | null;
  creditCard: RefDTO | null;
  frequency: Frequency;
  intervalDays: number | null;
  day1: number | null;
  day2: number | null;
  startDate: IsoDate;
  endDate: IsoDate | null;
  isActive: boolean;
  nextDate: IsoDate | null;
}

export interface ScheduledItemDTO {
  /** UUID; en los derivados, `card:<id>` o `loan:<id>`. */
  id: string;
  kind: ScheduledKind;
  name: string;
  amount: number;
  dueDate: IsoDate;
  ruleDate: IsoDate | null;
  status: ScheduledStatus;
  category: CategoryRefDTO | null;
  account: AccountRefDTO | null;
  creditCard: RefDTO | null;
  recurringRuleId: string | null;
  transactionId: string | null;
  /** Vencimientos calculados de tarjetas y préstamos (solo lectura). */
  derived: 'CARD' | 'LOAN' | null;
  sourceId: string | null;
}

export type AlertLevel = 'INFO' | 'WARNING' | 'DANGER';

export interface AlertDTO {
  key: string;
  level: AlertLevel;
  title: string;
  message: string;
  href: string | null;
}

export interface StatusDTO {
  level: 'OK' | 'WARNING' | 'DANGER';
  title: string;
  message: string;
}

export interface SpendingPowerDTO {
  daily: number;
  spentToday: number;
  /** daily − spentToday; negativo = "Hoy te pasaste". */
  remainingToday: number;
  limitedBy: 'LIQUIDITY' | 'BUDGET';
  /** Causa principal cuando daily = 0. */
  reason: string | null;
  breakdown: {
    liquidity: { daily: number; bindingDate: IsoDate; days: number; items: BreakdownItem[] };
    budget: { daily: number; days: number; items: BreakdownItem[] } | null;
  };
}

export interface DashboardBudgetDTO {
  budget: number;
  spent: number;
  usage: number;
  projectionExceedsOnDay: number | null;
}
