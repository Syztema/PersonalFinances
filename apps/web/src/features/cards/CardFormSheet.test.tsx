import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreditCardDTO } from '@finanzas/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmTwice, demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { CardFormSheet } from './CardFormSheet';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

  it('toasts and closes after a soft delete', async () => {
    const onOpenChange = vi.fn();
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'DELETE /credit-cards/c1': () => ({ status: 200, body: { deleted: 'soft' } }),
    });
    renderWithProviders(<CardFormSheet open onOpenChange={onOpenChange} card={card} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar tarjeta' }));
    await vi.advanceTimersByTimeAsync(500);
    await userEvent.click(screen.getByRole('button', { name: '¿Seguro? Toca de nuevo' }));
    expect(
      await screen.findByText('Tarjeta eliminada: se conserva su historial'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows the server message and stays open on CARD_HAS_DEBT', async () => {
    const onOpenChange = vi.fn();
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'DELETE /credit-cards/c1': () => ({
        status: 409,
        body: { error: { code: 'CARD_HAS_DEBT', message: 'La tarjeta aún tiene deuda' } },
      }),
    });
    renderWithProviders(<CardFormSheet open onOpenChange={onOpenChange} card={card} />);
    await screen.findByRole('button', { name: 'Eliminar tarjeta' });
    await confirmTwice('Eliminar tarjeta');
    expect(await screen.findByRole('alert')).toHaveTextContent('La tarjeta aún tiene deuda');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
