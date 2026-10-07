import { screen } from '@testing-library/react';
import type { CreditCardDTO } from '@finanzas/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { CardFormSheet } from './CardFormSheet';

afterEach(() => vi.unstubAllGlobals());

const card = {
  id: 'c1',
  name: 'Nu Crédito',
  issuer: null,
  creditLimit: 5_000_000,
  statementDay: 10,
  paymentDueDay: 25,
  initialDebt: 500_000,
  initialDebtInstallments: 1,
  openingDate: '2026-09-01',
  color: '#820ad1',
  icon: 'credit-card',
  isActive: true,
  debt: 800_000,
} as unknown as CreditCardDTO;

describe('CardFormSheet', () => {
  it('labels the debt as initial when editing and shows today debt', async () => {
    mockApi({ 'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }) });
    renderWithProviders(<CardFormSheet open onOpenChange={() => undefined} card={card} />);
    expect(
      await screen.findByLabelText('Deuda inicial (al registrar la tarjeta)'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tu deuda de hoy es \$800\.000/)).toBeInTheDocument();
  });
});
