import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { QuickAddProvider } from '../quick-add/QuickAddContext';
import { CardDetailPage } from './CardDetailPage';

afterEach(() => vi.unstubAllGlobals());

const deleted = {
  id: 'c1',
  name: 'Vieja',
  issuer: null,
  creditLimit: 5_000_000,
  initialDebt: 0,
  initialDebtInstallments: 1,
  openingDate: '2026-10-01',
  statementDay: 15,
  paymentDueDay: 30,
  icon: 'credit-card',
  color: '#820ad1',
  isActive: false,
  sortOrder: 0,
  debt: 100_000,
  available: 4_900_000,
  utilization: 0,
  amountDue: 0,
  dueDate: '2026-10-30',
  isOverdue: false,
  lastCutoff: '2026-10-15',
  nextCutoff: '2026-11-15',
  nextDueDate: '2026-11-30',
  committed: 0,
};

describe('CardDetailPage', () => {
  it('offers restore and blocks edit and purchases for a deleted card', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /credit-cards/c1/statement': () => ({
        status: 200,
        body: { card: deleted, upcoming: [] },
      }),
      'GET /transactions': () => ({ status: 200, body: { items: [], nextCursor: null } }),
    });
    renderWithProviders(
      <QuickAddProvider>
        <Routes>
          <Route path="/cards/:id" element={<CardDetailPage />} />
        </Routes>
      </QuickAddProvider>,
      { route: '/cards/c1' },
    );
    expect(await screen.findByRole('button', { name: 'Restaurar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar compra' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pagar tarjeta' })).toBeDisabled();
  });
});
