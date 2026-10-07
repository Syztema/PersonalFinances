import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { CardsPage } from './CardsPage';

afterEach(() => vi.unstubAllGlobals());

const card = {
  id: 'c1',
  name: 'Nu Crédito',
  issuer: 'Nu',
  creditLimit: 5_000_000,
  initialDebt: 0,
  initialDebtInstallments: 1,
  openingDate: '2026-10-01',
  statementDay: 15,
  paymentDueDay: 30,
  icon: 'credit-card',
  color: '#820ad1',
  isActive: true,
  sortOrder: 0,
  debt: -50_000,
  available: 5_050_000,
  utilization: 0,
  amountDue: 0,
  dueDate: '2026-10-30',
  isOverdue: false,
  lastCutoff: '2026-10-15',
  nextCutoff: '2026-11-15',
  nextDueDate: '2026-11-30',
  committed: 0,
};

describe('CardsPage', () => {
  it('shows an overpaid card as balance in favor and restores deleted cards', async () => {
    const restored: string[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /credit-cards': () => ({
        status: 200,
        body: { items: [card, { ...card, id: 'c2', name: 'Vieja', isActive: false, debt: 0 }] },
      }),
      'POST /credit-cards/c2/restore': () => {
        restored.push('c2');
        return { status: 200, body: { card } };
      },
    });
    renderWithProviders(<CardsPage />);
    expect(await screen.findByText('Saldo a favor')).toBeInTheDocument();
    expect(screen.getByText('$50.000')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Vieja' }));
    await waitFor(() => expect(restored).toEqual(['c2']));
  });

  it('shows the empty state plus deleted cards when every card is deleted', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /credit-cards': () => ({
        status: 200,
        body: { items: [{ ...card, isActive: false, debt: 0 }] },
      }),
    });
    renderWithProviders(<CardsPage />);
    expect(await screen.findByText('Aún no tienes tarjetas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Eliminados \(1\)/ })).toBeInTheDocument();
  });
});
