import { isLiquidAccount, type AccountType } from '@finanzas/shared';
import { applyLedger, type LedgerEntry } from './ledger';

export interface MoneySummary {
  total: number;
  liquid: number;
  savings: number;
  investment: number;
}

export function summarizeMoney(
  accounts: Array<{ type: AccountType; balance: number }>,
): MoneySummary {
  const s: MoneySummary = { total: 0, liquid: 0, savings: 0, investment: 0 };
  for (const a of accounts) {
    s.total += a.balance;
    if (isLiquidAccount(a.type)) s.liquid += a.balance;
    else if (a.type === 'SAVINGS') s.savings += a.balance;
    else if (a.type === 'INVESTMENT') s.investment += a.balance;
  }
  return s;
}

export function summarizeDebts(cardDebts: number[], loanBalances: number[]) {
  const cards = cardDebts.reduce((s, d) => s + Math.max(d, 0), 0);
  const loans = loanBalances.reduce((s, d) => s + Math.max(d, 0), 0);
  return { cards, loans, total: cards + loans };
}

export interface MonthFlows {
  income: number;
  expense: number;
  savings: number;
  investment: number;
  remaining: number;
}

/** Spec 8.2: ahorro e inversión = variación por movimientos de las cuentas SAVINGS / INVESTMENT. */
export function monthFlows(
  entries: LedgerEntry[],
  accountTypes: ReadonlyMap<string, AccountType>,
): MonthFlows {
  const totals = applyLedger(entries);
  let savings = 0;
  let investment = 0;
  for (const [accountId, delta] of totals.accountDeltas) {
    const type = accountTypes.get(accountId);
    if (type === 'SAVINGS') savings += delta;
    else if (type === 'INVESTMENT') investment += delta;
  }
  return {
    income: totals.income,
    expense: totals.expense,
    savings,
    investment,
    remaining: totals.income - totals.expense - savings - investment,
  };
}
