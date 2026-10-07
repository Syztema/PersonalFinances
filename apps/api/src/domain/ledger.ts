import type { TransactionType } from '@finanzas/shared';

export interface LedgerEntry {
  type: TransactionType;
  amount: number;
  accountId: string | null;
  toAccountId: string | null;
  creditCardId: string | null;
  debtId: string | null;
}

export interface Effects {
  accounts: Array<{ accountId: string; delta: number }>;
  card: { creditCardId: string; delta: number } | null;
  loan: { debtId: string; delta: number } | null;
  income: number;
  expense: number;
}

function req(id: string | null, field: string, type: TransactionType): string {
  if (!id) throw new Error(`${type} requires ${field}`);
  return id;
}

/** Spec 8.1: única fuente de verdad sobre qué cambia cada tipo de movimiento. */
export function effectsOf(e: LedgerEntry): Effects {
  const a = e.amount;
  const none: Effects = { accounts: [], card: null, loan: null, income: 0, expense: 0 };
  switch (e.type) {
    case 'INCOME':
      return {
        ...none,
        accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: a }],
        income: a,
      };
    case 'EXPENSE':
      return {
        ...none,
        accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: -a }],
        expense: a,
      };
    case 'TRANSFER':
      return {
        ...none,
        accounts: [
          { accountId: req(e.accountId, 'accountId', e.type), delta: -a },
          { accountId: req(e.toAccountId, 'toAccountId', e.type), delta: a },
        ],
      };
    case 'CARD_PURCHASE':
      return {
        ...none,
        card: { creditCardId: req(e.creditCardId, 'creditCardId', e.type), delta: a },
        expense: a,
      };
    case 'CARD_PAYMENT':
      return {
        ...none,
        accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: -a }],
        card: { creditCardId: req(e.creditCardId, 'creditCardId', e.type), delta: -a },
      };
    case 'DEBT_PAYMENT':
      return {
        ...none,
        accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: -a }],
        loan: { debtId: req(e.debtId, 'debtId', e.type), delta: -a },
      };
    case 'DEBT_DISBURSEMENT':
      return {
        ...none,
        accounts: [{ accountId: req(e.accountId, 'accountId', e.type), delta: a }],
        loan: { debtId: req(e.debtId, 'debtId', e.type), delta: a },
      };
  }
}

export interface LedgerTotals {
  accountDeltas: Map<string, number>;
  cardDeltas: Map<string, number>;
  loanDeltas: Map<string, number>;
  income: number;
  expense: number;
}

const add = (map: Map<string, number>, key: string, value: number) =>
  map.set(key, (map.get(key) ?? 0) + value);

export function applyLedger(entries: Iterable<LedgerEntry>): LedgerTotals {
  const totals: LedgerTotals = {
    accountDeltas: new Map(),
    cardDeltas: new Map(),
    loanDeltas: new Map(),
    income: 0,
    expense: 0,
  };
  for (const entry of entries) {
    const fx = effectsOf(entry);
    for (const a of fx.accounts) add(totals.accountDeltas, a.accountId, a.delta);
    if (fx.card) add(totals.cardDeltas, fx.card.creditCardId, fx.card.delta);
    if (fx.loan) add(totals.loanDeltas, fx.loan.debtId, fx.loan.delta);
    totals.income += fx.income;
    totals.expense += fx.expense;
  }
  return totals;
}
