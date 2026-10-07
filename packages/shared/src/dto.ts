import type { IsoDate } from './dates';
import type {
  AccountType,
  Bucket,
  CategoryKind,
  DerivedMethod,
  PaymentMethod,
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
}
