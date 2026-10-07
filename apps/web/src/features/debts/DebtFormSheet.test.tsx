import { screen } from '@testing-library/react';
import type { DebtDTO } from '@finanzas/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { DebtFormSheet } from './DebtFormSheet';

afterEach(() => vi.unstubAllGlobals());

const debt = {
  id: 'd1',
  name: 'Libre inversión',
  lender: 'Bancolombia',
  initialBalance: 8_000_000,
  openingDate: '2026-09-01',
  monthlyPayment: 450_000,
  paymentDay: 5,
  icon: 'landmark',
  color: '#ca8a04',
  isActive: true,
  balance: 7_550_000,
  installmentDue: 0,
  nextPaymentDate: '2026-11-05',
} as unknown as DebtDTO;

describe('DebtFormSheet', () => {
  it('labels the balance as initial when editing and shows today balance', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [] } }),
    });
    renderWithProviders(<DebtFormSheet open onOpenChange={() => undefined} debt={debt} />);
    expect(
      await screen.findByLabelText('Saldo inicial (al registrar el préstamo)'),
    ).toBeInTheDocument();
    expect(screen.getByText(/El saldo de hoy es \$7\.550\.000/)).toBeInTheDocument();
  });
});
