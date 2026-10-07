import { describe, expect, it } from 'vitest';
import type { AccountType } from '@finanzas/shared';
import { monthFlows, summarizeDebts, summarizeMoney } from './balances';
import type { LedgerEntry } from './ledger';

describe('summarizeMoney', () => {
  it('adds every account and separates liquid from savings and investment', () => {
    const s = summarizeMoney([
      { type: 'CASH', balance: 100_000 },
      { type: 'BANK', balance: 1_500_000 },
      { type: 'DIGITAL_WALLET', balance: 300_000 },
      { type: 'BANK', balance: 600_000 },
    ]);
    expect(s.total).toBe(2_500_000);
    expect(s.liquid).toBe(2_500_000);

    const withSavings = summarizeMoney([
      { type: 'BANK', balance: 2_000_000 },
      { type: 'SAVINGS', balance: 1_000_000 },
      { type: 'INVESTMENT', balance: 500_000 },
    ]);
    expect(withSavings).toEqual({
      total: 3_500_000,
      liquid: 2_000_000,
      savings: 1_000_000,
      investment: 500_000,
    });
  });
});

describe('summarizeDebts', () => {
  it('never counts a card credit balance as negative debt', () => {
    expect(summarizeDebts([800_000, -50_000], [1_000_000])).toEqual({
      cards: 800_000,
      loans: 1_000_000,
      total: 1_800_000,
    });
  });
});

describe('monthFlows', () => {
  const types = new Map<string, AccountType>([
    ['BANK', 'BANK'],
    ['SAVE', 'SAVINGS'],
    ['INV', 'INVESTMENT'],
  ]);
  const e = (
    type: LedgerEntry['type'],
    amount: number,
    ids: Partial<LedgerEntry>,
  ): LedgerEntry => ({
    type,
    amount,
    accountId: null,
    toAccountId: null,
    creditCardId: null,
    debtId: null,
    ...ids,
  });

  it('matches the spec month balance (4.000.000 − 2.100.000 − 800.000 = 1.100.000)', () => {
    const flows = monthFlows(
      [
        e('INCOME', 4_000_000, { accountId: 'BANK' }),
        e('EXPENSE', 1_300_000, { accountId: 'BANK' }),
        e('CARD_PURCHASE', 800_000, { creditCardId: 'NU' }),
        e('TRANSFER', 800_000, { accountId: 'BANK', toAccountId: 'SAVE' }),
        e('CARD_PAYMENT', 500_000, { accountId: 'BANK', creditCardId: 'NU' }),
      ],
      types,
    );
    expect(flows).toEqual({
      income: 4_000_000,
      expense: 2_100_000,
      savings: 800_000,
      investment: 0,
      remaining: 1_100_000,
    });
  });

  it('a transfer to savings is not an expense; a withdrawal reduces savings', () => {
    const flows = monthFlows(
      [
        e('TRANSFER', 500_000, { accountId: 'BANK', toAccountId: 'SAVE' }),
        e('TRANSFER', 200_000, { accountId: 'SAVE', toAccountId: 'BANK' }),
        e('TRANSFER', 100_000, { accountId: 'BANK', toAccountId: 'INV' }),
      ],
      types,
    );
    expect(flows.expense).toBe(0);
    expect(flows.savings).toBe(300_000);
    expect(flows.investment).toBe(100_000);
  });
});
