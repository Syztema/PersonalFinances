import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { GoalsPage } from './GoalsPage';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const savings = {
  id: 'a2',
  name: 'Bolsillo ahorro',
  type: 'SAVINGS',
  institution: null,
  initialBalance: 0,
  openingDate: '2026-10-01',
  icon: 'piggy-bank',
  color: '#0ea5e9',
  isActive: true,
  sortOrder: 1,
  balance: 1_400_000,
};
const bank = { ...savings, id: 'a1', name: 'Bancolombia', type: 'BANK', icon: 'landmark' };
const goal = {
  id: 'g1',
  name: 'Comprar computador',
  targetAmount: 5_000_000,
  targetDate: '2027-06-30',
  account: {
    id: 'a2',
    name: 'Bolsillo ahorro',
    icon: 'piggy-bank',
    color: '#0ea5e9',
    isActive: true,
    type: 'SAVINGS',
  },
  initialAmount: 1_000_000,
  status: 'ACTIVE',
  icon: 'laptop',
  color: '#0ea5e9',
  contributed: 500_000,
  withdrawn: 100_000,
  progress: 1_400_000,
  pct: 0.28,
  remaining: 3_600_000,
  monthlyNeeded: 450_000,
  weeklyNeeded: 94_737,
};
const reached = { ...goal, progress: 5_000_000, pct: 1, remaining: 0, monthlyNeeded: null };
const completed = { ...reached, status: 'COMPLETED' };
const me = () => ({ status: 200, body: { user: demoUser } });

describe('GoalsPage (spec 8.10)', () => {
  it('shows progress and what to save per month and week', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
    });
    renderWithProviders(<GoalsPage />);
    expect(await screen.findByText('Comprar computador')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Avance de Comprar computador' }),
    ).toHaveAttribute('aria-valuenow', '28');
    expect(
      screen.getByText('Te faltan $3.600.000: ahorra $450.000 al mes ($94.737 a la semana).'),
    ).toBeInTheDocument();
  });

  it('adds money to a goal as a transfer from another account', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'POST /goals/g1/contributions': (body) => {
        posted.push(body);
        return { status: 201, body: { transaction: { id: 't1' }, warnings: [], goal } };
      },
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abonar' }));
    await userEvent.type(await screen.findByLabelText('Valor'), '200000');
    await userEvent.selectOptions(screen.getByLabelText('Desde la cuenta'), 'a1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(posted).toEqual([{ fromAccountId: 'a1', amount: 200_000, date: expect.any(String) }]),
    );
  });

  it('shows the withdrawal cap hint and the server field error under Valor', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'POST /goals/g1/withdrawals': () => ({
        status: 400,
        body: {
          error: {
            code: 'WITHDRAWAL_EXCEEDS_GOAL',
            message: 'No puedes retirar más de lo ahorrado en esta meta',
            fields: { amount: 'No puedes retirar más de lo ahorrado en esta meta' },
          },
        },
      }),
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar' }));
    expect(await screen.findByText('Máximo $1.400.000')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Valor'), '2000000');
    await userEvent.selectOptions(screen.getByLabelText('Hacia la cuenta'), 'a1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('No puedes retirar más de lo ahorrado en esta meta'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('creates a goal in a savings account', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'POST /goals': (body) => {
        posted.push(body);
        return { status: 201, body: { goal } };
      },
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva meta' }));
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Viaje');
    await userEvent.type(screen.getByLabelText('Valor objetivo'), '3000000');
    expect(screen.queryByRole('option', { name: 'Bancolombia' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      name: 'Viaje',
      targetAmount: 3_000_000,
      targetDate: null,
      accountId: 'a2',
      initialAmount: 0,
    });
  });

  it('marks a reached goal as completed once, even on a double tap', async () => {
    const puts: unknown[] = [];
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [reached] } }),
      'PUT /goals/g1': async (body) => {
        puts.push(body);
        await new Promise((r) => setTimeout(r, 1000));
        return { status: 200, body: { goal: completed } };
      },
    });
    renderWithProviders(<GoalsPage />);
    const button = await screen.findByRole('button', { name: 'Marcar como completada' });
    await userEvent.dblClick(button);
    await waitFor(() => expect(puts).toEqual([{ status: 'COMPLETED' }]));
    expect(screen.getByRole('button', { name: 'Marcar como completada' })).toBeDisabled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(puts).toHaveLength(1);
  });

  it('reopens a completed goal', async () => {
    const puts: unknown[] = [];
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [completed] } }),
      'PUT /goals/g1': (body) => {
        puts.push(body);
        return { status: 200, body: { goal: reached } };
      },
    });
    renderWithProviders(<GoalsPage />);
    expect(await screen.findByText('Completadas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(puts).toEqual([{ status: 'ACTIVE' }]));
  });

  it('toasts the server message when changing the status fails', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [completed] } }),
      'PUT /goals/g1': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'No se pudo actualizar la meta' } },
      }),
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reabrir' }));
    expect(await screen.findByText('No se pudo actualizar la meta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reabrir' })).toBeEnabled();
  });

  it('deletes a goal after a confirm step and explains what happens to its movements', async () => {
    let deleted = 0;
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'DELETE /goals/g1': () => {
        deleted += 1;
        return { status: 204, body: undefined };
      },
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(
      await screen.findByText(
        'Sus abonos y retiros quedan en el historial como transferencias normales.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar meta' }));
    expect(deleted).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar: Eliminar meta' }));
    await waitFor(() => expect(deleted).toBe(1));
  });

  it('sends the withdrawal body to the right endpoint', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'POST /goals/g1/withdrawals': (body) => {
        posted.push(body);
        return { status: 201, body: { transaction: { id: 't1' }, warnings: [], goal } };
      },
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar' }));
    await userEvent.type(await screen.findByLabelText('Valor'), '300000');
    await userEvent.selectOptions(screen.getByLabelText('Hacia la cuenta'), 'a1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(posted).toEqual([{ toAccountId: 'a1', amount: 300_000, date: expect.any(String) }]),
    );
  });

  it('sends the edit body with PUT', async () => {
    const puts: unknown[] = [];
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'PUT /goals/g1': (body) => {
        puts.push(body);
        return { status: 200, body: { goal } };
      },
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const name = await screen.findByLabelText('Nombre');
    await userEvent.clear(name);
    await userEvent.type(name, 'Portátil');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));
    await waitFor(() =>
      expect(puts).toEqual([
        {
          name: 'Portátil',
          targetAmount: 5_000_000,
          targetDate: '2027-06-30',
          accountId: 'a2',
          initialAmount: 1_000_000,
          icon: 'laptop',
          color: '#0ea5e9',
        },
      ]),
    );
  });

  it('shows the initial amount error from the server under "Ya tengo ahorrado"', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'PUT /goals/g1': () => ({
        status: 400,
        body: {
          error: {
            code: 'WITHDRAWAL_EXCEEDS_GOAL',
            message: 'Revisa los datos ingresados.',
            fields: { initialAmount: 'La meta quedaría con saldo negativo' },
          },
        },
      }),
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const initial = await screen.findByLabelText('Ya tengo ahorrado (opcional)');
    await userEvent.clear(initial);
    await userEvent.type(initial, '50000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));
    expect(await screen.findByText('La meta quedaría con saldo negativo')).toBeInTheDocument();
    expect(initial).toHaveAttribute('aria-invalid', 'true');
    expect(initial).toHaveAccessibleDescription('La meta quedaría con saldo negativo');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the server message when the account of a goal with movements changes', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'PUT /goals/g1': () => ({
        status: 409,
        body: {
          error: {
            code: 'GOAL_HAS_MOVEMENTS',
            message: 'No puedes cambiar la cuenta de una meta con movimientos',
          },
        },
      }),
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar meta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No puedes cambiar la cuenta de una meta con movimientos',
    );
  });

  it('only restricts the target date to the future when creating or when it is still future', async () => {
    const past = { ...goal, targetDate: '2020-01-01' };
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [past] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(await screen.findByLabelText('Fecha objetivo (opcional)')).toHaveAttribute(
      'min',
      '2020-01-01',
    );
  });

  it('uses today as the minimum date when creating and for a future target date', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva meta' }));
    const create = await screen.findByLabelText('Fecha objetivo (opcional)');
    expect(create).toHaveAttribute('min', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    const today = create.getAttribute('min');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(await screen.findByLabelText('Fecha objetivo (opcional)')).toHaveAttribute('min', today);
  });

  it('flags an overdue goal next to the monthly amounts', async () => {
    const overdue = { ...goal, targetDate: '2020-01-01' };
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [overdue] } }),
    });
    renderWithProviders(<GoalsPage />);
    expect(await screen.findByText(/La fecha objetivo ya pasó\./)).toBeInTheDocument();
  });

  it('asks for another active account when there is none to move money from or to', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [savings] } }),
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abonar' }));
    expect(
      await screen.findByText('Necesitas otra cuenta activa para abonar o retirar.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });
});

describe('GoalsPage errors (final review M4, M5)', () => {
  it('shows the status error with the error styling, not as a success', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [completed] } }),
      'PUT /goals/g1': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'No se pudo actualizar la meta' } },
      }),
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reabrir' }));
    const toast = (await screen.findByText('No se pudo actualizar la meta')).closest(
      '[role="status"]',
    );
    expect(toast).toHaveClass('bg-negative');
    expect(toast).not.toHaveClass('bg-fg');
  });

  it('offers a retry when the accounts fail to load instead of saying another account is needed', async () => {
    let attempts = 0;
    mockApi({
      'GET /auth/me': me,
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => {
        attempts += 1;
        return attempts === 1
          ? { status: 500, body: { error: { code: 'INTERNAL', message: 'Error del servidor' } } }
          : { status: 200, body: { items: [bank, savings] } };
      },
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abonar' }));
    expect(await screen.findByText('Error del servidor')).toBeInTheDocument();
    expect(screen.queryByText(/Necesitas otra cuenta/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Desde la cuenta')).toBeInTheDocument();
  });
});
