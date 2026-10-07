import type { TransactionDTO } from '@finanzas/shared';
import { describe, expect, it } from 'vitest';
import { kindForTransaction } from './QuickAddSheets';

const tx = (type: string) => ({ type }) as unknown as TransactionDTO;

describe('kindForTransaction', () => {
  it('maps every editable type to its form', () => {
    expect(kindForTransaction(tx('CARD_PURCHASE'))).toBe('expense');
    expect(kindForTransaction(tx('EXPENSE'))).toBe('expense');
    expect(kindForTransaction(tx('DEBT_PAYMENT'))).toBe('loan-payment');
    expect(kindForTransaction(tx('DEBT_DISBURSEMENT'))).toBe('disbursement');
  });
});
