import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { AccountsPage } from './AccountsPage';

afterEach(() => vi.unstubAllGlobals());

const bancolombia = {
  id: 'a1',
  name: 'Bancolombia',
  type: 'BANK',
  institution: null,
  initialBalance: 1_000_000,
  openingDate: '2026-10-01',
  icon: 'landmark',
  color: '#ca8a04',
  isActive: true,
  sortOrder: 0,
  balance: 1_500_000,
};

describe('AccountsPage', () => {
  it('lists accounts with the total and creates a new one', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'POST /accounts': (body) => {
        posted.push(body);
        return { status: 201, body: { account: { ...bancolombia, id: 'a2', name: 'Nequi' } } };
      },
    });
    renderWithProviders(<AccountsPage />);
    expect(await screen.findByText('Bancolombia')).toBeInTheDocument();
    expect(screen.getAllByText('$1.500.000').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nequi');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'DIGITAL_WALLET');
    await userEvent.type(screen.getByLabelText('Saldo actual'), '150000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cuenta' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      name: 'Nequi',
      type: 'DIGITAL_WALLET',
      initialBalance: 150000,
      icon: 'smartphone',
    });
  });

  it('sums archived accounts into the total like the dashboard does', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({
        status: 200,
        body: {
          items: [
            bancolombia,
            { ...bancolombia, id: 'a9', name: 'Vieja', isActive: false, balance: 200_000 },
          ],
        },
      }),
    });
    renderWithProviders(<AccountsPage />);
    await screen.findByText('Bancolombia');
    expect(screen.getAllByText('$1.700.000').length).toBeGreaterThan(0);
  });

  it('shows the API reason when archiving is not allowed', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'PUT /accounts/a1': () => ({
        status: 409,
        body: {
          error: {
            code: 'ACCOUNT_HAS_BALANCE',
            message: 'Solo puedes archivar una cuenta con saldo $0.',
          },
        },
      }),
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByText('Bancolombia'));
    await userEvent.click(screen.getByRole('button', { name: 'Archivar' }));
    expect(
      await screen.findByText('Solo puedes archivar una cuenta con saldo $0.'),
    ).toBeInTheDocument();
  });

  it('labels the balance as initial balance when editing and shows today balance', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByText('Bancolombia'));
    expect(screen.getByLabelText('Saldo inicial (al registrar la cuenta)')).toBeInTheDocument();
    expect(screen.getByText(/Tu saldo de hoy es \$1\.500\.000/)).toBeInTheDocument();
  });

  it('shows the general message when the server rejects a field the form does not render', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'POST /accounts': () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Revisa los datos ingresados.',
            fields: { openingDate: 'Fecha inválida' },
          },
        },
      }),
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nequi');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cuenta' }));
    expect(await screen.findByText('Revisa los datos ingresados.')).toBeInTheDocument();
  });
});
