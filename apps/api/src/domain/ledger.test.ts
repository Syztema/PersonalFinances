import { describe, expect, it } from 'vitest';
import type { TransactionType } from '@finanzas/shared';
import { applyLedger, effectsOf, type LedgerEntry } from './ledger';

const entry = (
  type: TransactionType,
  amount: number,
  ids: Partial<LedgerEntry> = {},
): LedgerEntry => ({
  type,
  amount,
  accountId: null,
  toAccountId: null,
  creditCardId: null,
  debtId: null,
  ...ids,
});

describe('effectsOf', () => {
  it.each([
    ['INCOME', { accountId: 'A' }, [['A', 100]], null, null, 100, 0],
    ['EXPENSE', { accountId: 'A' }, [['A', -100]], null, null, 0, 100],
    [
      'TRANSFER',
      { accountId: 'A', toAccountId: 'B' },
      [
        ['A', -100],
        ['B', 100],
      ],
      null,
      null,
      0,
      0,
    ],
    ['CARD_PURCHASE', { creditCardId: 'C' }, [], 100, null, 0, 100],
    ['CARD_PAYMENT', { accountId: 'A', creditCardId: 'C' }, [['A', -100]], -100, null, 0, 0],
    ['DEBT_PAYMENT', { accountId: 'A', debtId: 'D' }, [['A', -100]], null, -100, 0, 0],
    ['DEBT_DISBURSEMENT', { accountId: 'A', debtId: 'D' }, [['A', 100]], null, 100, 0, 0],
  ] as const)('%s', (type, ids, accounts, card, loan, income, expense) => {
    const fx = effectsOf(entry(type, 100, ids));
    expect(fx.accounts.map((a) => [a.accountId, a.delta])).toEqual(accounts);
    expect(fx.card?.delta ?? null).toBe(card);
    expect(fx.loan?.delta ?? null).toBe(loan);
    expect(fx.income).toBe(income);
    expect(fx.expense).toBe(expense);
  });

  it('only income and expense change net worth', () => {
    const all: LedgerEntry[] = [
      entry('INCOME', 7, { accountId: 'A' }),
      entry('EXPENSE', 11, { accountId: 'A' }),
      entry('TRANSFER', 13, { accountId: 'A', toAccountId: 'B' }),
      entry('CARD_PURCHASE', 17, { creditCardId: 'C' }),
      entry('CARD_PAYMENT', 19, { accountId: 'A', creditCardId: 'C' }),
      entry('DEBT_PAYMENT', 23, { accountId: 'A', debtId: 'D' }),
      entry('DEBT_DISBURSEMENT', 29, { accountId: 'A', debtId: 'D' }),
    ];
    for (const e of all) {
      const fx = effectsOf(e);
      const netWorthChange =
        fx.accounts.reduce((s, a) => s + a.delta, 0) -
        (fx.card?.delta ?? 0) -
        (fx.loan?.delta ?? 0);
      expect(netWorthChange).toBe(fx.income - fx.expense);
    }
  });

  it('throws when a required reference is missing', () => {
    expect(() => effectsOf(entry('TRANSFER', 1, { accountId: 'A' }))).toThrow();
  });
});

describe('applyLedger — reference case from the spec', () => {
  it('a card purchase paid later counts as expense exactly once', () => {
    const purchase = entry('CARD_PURCHASE', 300_000, { creditCardId: 'NU' });
    const payment = entry('CARD_PAYMENT', 300_000, {
      accountId: 'BANCOLOMBIA',
      creditCardId: 'NU',
    });

    const afterPurchase = applyLedger([purchase]);
    expect(afterPurchase.accountDeltas.get('BANCOLOMBIA') ?? 0).toBe(0);
    expect(afterPurchase.cardDeltas.get('NU')).toBe(300_000);
    expect(afterPurchase.expense).toBe(300_000);

    const afterPayment = applyLedger([purchase, payment]);
    expect(afterPayment.accountDeltas.get('BANCOLOMBIA')).toBe(-300_000);
    expect(afterPayment.cardDeltas.get('NU')).toBe(0);
    expect(afterPayment.expense).toBe(300_000);
  });
});
