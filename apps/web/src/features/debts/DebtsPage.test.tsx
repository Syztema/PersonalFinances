import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { QuickAddProvider } from '../quick-add/QuickAddContext';
import { DebtsPage } from './DebtsPage';

afterEach(() => vi.unstubAllGlobals());

describe('DebtsPage', () => {
  it('shows the empty state plus deleted loans when every loan is deleted', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /debts': () => ({
        status: 200,
        body: {
          items: [
            {
              id: 'd1',
              name: 'Vieja deuda',
              lender: null,
              initialBalance: 0,
              openingDate: '2026-09-01',
              monthlyPayment: null,
              paymentDay: null,
              icon: 'landmark',
              color: '#ca8a04',
              isActive: false,
              balance: 0,
              installmentDue: 0,
              nextPaymentDate: null,
            },
          ],
        },
      }),
    });
    renderWithProviders(
      <QuickAddProvider>
        <DebtsPage />
      </QuickAddProvider>,
    );
    expect(await screen.findByText('No tienes préstamos registrados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Eliminados \(1\)/ })).toBeInTheDocument();
  });
});
