import type { TransactionDTO } from '@finanzas/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test-utils';
import { QuickAddProvider } from '../quick-add/QuickAddContext';
import { TransactionDetailSheet } from './TransactionDetailSheet';

const disbursement: TransactionDTO = {
  id: 't9',
  type: 'DEBT_DISBURSEMENT',
  amount: 1_000_000,
  date: '2026-10-06',
  description: null,
  payee: null,
  notes: null,
  account: {
    id: 'a1',
    name: 'Bancolombia',
    icon: 'wallet',
    color: '#123456',
    type: 'BANK',
    isActive: true,
  },
  toAccount: null,
  creditCard: null,
  debt: { id: 'd1', name: 'Préstamo', icon: 'landmark', color: '#123456', isActive: true },
  category: null,
  companion: null,
  goalId: null,
  installments: null,
  paymentMethod: null,
  method: null,
  parentId: null,
  interest: 0,
  tags: [],
  createdAt: '2026-10-06T15:00:00.000Z',
};

describe('TransactionDetailSheet', () => {
  it('offers edit and delete for a loan disbursement', () => {
    renderWithProviders(
      <QuickAddProvider>
        <TransactionDetailSheet transaction={disbursement} onClose={() => undefined} />
      </QuickAddProvider>,
    );
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('shows who an expense was with, marking a deleted option', () => {
    renderWithProviders(
      <QuickAddProvider>
        <TransactionDetailSheet
          transaction={{
            ...disbursement,
            type: 'EXPENSE',
            debt: null,
            companion: {
              id: 'p3',
              name: 'Vecinos',
              icon: 'home',
              color: '#2563eb',
              isActive: false,
            },
          }}
          onClose={() => undefined}
        />
      </QuickAddProvider>,
    );
    expect(screen.getByText('Con quién')).toBeInTheDocument();
    expect(screen.getByText('Vecinos (eliminada)')).toBeInTheDocument();
  });
});
