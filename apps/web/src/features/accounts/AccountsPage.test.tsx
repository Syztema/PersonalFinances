import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmTwice, demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { AccountsPage } from './AccountsPage';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

  it('totals only active accounts and lists deleted ones under Eliminados', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({
        status: 200,
        body: {
          items: [
            bancolombia,
            { ...bancolombia, id: 'a9', name: 'Vieja', isActive: false, balance: 0 },
          ],
        },
      }),
    });
    renderWithProviders(<AccountsPage />);
    await screen.findByText('Bancolombia');
    expect(screen.getAllByText('$1.500.000')).toHaveLength(2);
    expect(screen.queryByText('Vieja')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Eliminados \(1\)/ }));
    expect(screen.getByText('Vieja')).toBeInTheDocument();
  });

  it('excludes a deleted account from the total', async () => {
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
    expect(screen.queryByText('$1.700.000')).not.toBeInTheDocument();
  });

  it('explains how to reach $0 when deletion is blocked', async () => {
    const message =
      'La cuenta tiene un saldo de $1.500.000. Déjala en $0 antes de eliminarla: transfiere el dinero, ajusta el saldo o corrige el saldo inicial.';
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'DELETE /accounts/a1': () => ({
        status: 409,
        body: { error: { code: 'ACCOUNT_HAS_BALANCE', message } },
      }),
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByText('Bancolombia'));
    await confirmTwice('Eliminar cuenta');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it.each([
    ['hard', 'Cuenta eliminada'],
    ['soft', 'Cuenta eliminada: se conserva su historial'],
  ])('toasts the %s delete result and closes the sheet', async (deleted, text) => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'DELETE /accounts/a1': () => ({ status: 200, body: { deleted } }),
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByText('Bancolombia'));
    await confirmTwice('Eliminar cuenta');
    expect(await screen.findByText(text)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps deleted accounts folded under Eliminados and restores them', async () => {
    const restored: string[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({
        status: 200,
        body: {
          items: [
            bancolombia,
            { ...bancolombia, id: 'a9', name: 'Vieja', isActive: false, balance: 0 },
          ],
        },
      }),
      'POST /accounts/a9/restore': () => {
        restored.push('a9');
        return { status: 200, body: { account: { ...bancolombia, id: 'a9', name: 'Vieja' } } };
      },
    });
    renderWithProviders(<AccountsPage />);
    await screen.findByText('Bancolombia');
    expect(screen.queryByText('Vieja')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Vieja' }));
    await waitFor(() => expect(restored).toEqual(['a9']));
  });

  it('shows the empty state plus Eliminados when every account is deleted', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({
        status: 200,
        body: {
          items: [{ ...bancolombia, id: 'a9', name: 'Vieja', isActive: false, balance: 0 }],
        },
      }),
    });
    renderWithProviders(<AccountsPage />);
    expect(await screen.findByText('Aún no tienes cuentas')).toBeInTheDocument();
    expect(screen.queryByText('Dinero total')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Eliminados \(1\)/ })).toBeInTheDocument();
  });

  it('creates an overdrawn account with a negative initial balance', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [] } }),
      'POST /accounts': (body) => {
        posted.push(body);
        return { status: 201, body: { account: bancolombia } };
      },
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Cuenta corriente');
    await userEvent.type(screen.getByLabelText('Saldo actual'), '50000');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Saldo negativo (sobregiro)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cuenta' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ name: 'Cuenta corriente', initialBalance: -50_000 });
  });

  it('adjusts the balance to the real one', async () => {
    const adjusted: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'POST /accounts/a1/adjust': (body) => {
        adjusted.push(body);
        return { status: 201, body: { transaction: { id: 't1' }, account: bancolombia } };
      },
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByText('Bancolombia'));
    await userEvent.click(screen.getByRole('button', { name: 'Ajustar saldo' }));
    await userEvent.type(await screen.findByLabelText('Saldo real hoy'), '1600000');
    expect(screen.getByText(/Se registrará un ingreso de/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }));
    await waitFor(() =>
      expect(adjusted).toEqual([{ actualBalance: 1_600_000, date: expect.any(String) }]),
    );
  });

  async function openAdjust() {
    await userEvent.click(await screen.findByText('Bancolombia'));
    await userEvent.click(screen.getByRole('button', { name: 'Ajustar saldo' }));
    return screen.findByLabelText('Saldo real hoy');
  }

  it('sends the adjustment once even if Guardar ajuste is tapped twice', async () => {
    let calls = 0;
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'POST /accounts/a1/adjust': () => {
        calls += 1;
        return new Promise(() => {});
      },
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.type(await openAdjust(), '1600000');
    const save = screen.getByRole('button', { name: 'Guardar ajuste' });
    await userEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    await userEvent.click(save);
    expect(calls).toBe(1);
  });

  it('shows NO_CHANGE under the real balance field', async () => {
    const message = 'El saldo real es igual al saldo actual.';
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'POST /accounts/a1/adjust': () => ({
        status: 400,
        body: {
          error: { code: 'NO_CHANGE', message: 'Sin cambios', fields: { actualBalance: message } },
        },
      }),
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.type(await openAdjust(), '1500000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }));
    const text = await screen.findByText(message);
    expect(within(text.parentElement!).getByLabelText('Saldo real hoy')).toBeInTheDocument();
  });

  it('previews a gasto when the real balance is lower', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.type(await openAdjust(), '1400000');
    expect(screen.getByText(/Se registrará un gasto de/)).toHaveTextContent('$100.000');
  });

  it('previews and posts a negative real balance with the overdraft toggle', async () => {
    const adjusted: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'POST /accounts/a1/adjust': (body) => {
        adjusted.push(body);
        return { status: 201, body: { transaction: { id: 't1' }, account: bancolombia } };
      },
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.type(await openAdjust(), '100000');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Saldo negativo (sobregiro)' }));
    expect(screen.getByText(/Se registrará un gasto de/)).toHaveTextContent('$1.600.000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }));
    await waitFor(() =>
      expect(adjusted).toEqual([{ actualBalance: -100_000, date: expect.any(String) }]),
    );
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
