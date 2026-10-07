import { addMonths, monthKey, todayIn } from '@finanzas/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { BudgetsPage } from './BudgetsPage';
import { projectionText } from './projection';

afterEach(() => vi.unstubAllGlobals());

const month = monthKey(todayIn('America/Bogota'));
const previous = monthKey(addMonths(`${month}-01`, -1));
const food = {
  id: 'k1',
  name: 'Alimentación',
  kind: 'EXPENSE',
  parentId: null as string | null,
  bucket: 'OBLIGATIONS',
  icon: 'utensils',
  color: '#f97316',
  isSystem: false,
  systemKey: null,
  isActive: true,
  sortOrder: 1,
};
const market = { ...food, id: 'k2', name: 'Mercado', parentId: 'k1', sortOrder: 2 };
const empty = (m: string) => ({
  month: m,
  totalAmount: null,
  lines: [],
  total: null,
  projection: null,
  daysLeft: 10,
  copiedFrom: null,
});
const ref = (c: typeof food, isActive = true) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  color: c.color,
  isActive,
  kind: 'EXPENSE',
  parentId: c.parentId,
});
const line = (id: string, c: typeof food, amount: number, isActive = true) => ({
  id,
  category: ref(c, isActive),
  amount,
  spent: 0,
  remaining: amount,
  usage: 0,
});
const filled = (m: string, lines: ReturnType<typeof line>[], extra = {}) => ({
  month: m,
  totalAmount: 2_000_000,
  lines,
  total: { budget: 2_000_000, spent: 0, remaining: 2_000_000, usage: 0 },
  projection: null,
  daysLeft: 10,
  copiedFrom: null,
  ...extra,
});
const me = { 'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }) };

describe('projectionText', () => {
  it('names the day', () => {
    expect(projectionText(25)).toBe('A este ritmo superarías el presupuesto el día 25.');
  });
});

describe('BudgetsPage (spec 8.9)', () => {
  it('creates the budget of the month', async () => {
    const puts: unknown[] = [];
    mockApi({
      ...me,
      [`GET /budgets/${month}`]: () => ({ status: 200, body: { budget: empty(month) } }),
      'GET /categories': () => ({ status: 200, body: { items: [food] } }),
      [`PUT /budgets/${month}`]: (body) => {
        puts.push(body);
        return { status: 200, body: { budget: empty(month) } };
      },
    });
    renderWithProviders(<BudgetsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Crear presupuesto' }));
    await userEvent.type(screen.getByLabelText('Presupuesto general (opcional)'), '2000000');
    await userEvent.selectOptions(await screen.findByLabelText('Agregar categoría'), 'k1');
    await userEvent.type(screen.getByLabelText('Alimentación'), '600000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));
    await waitFor(() =>
      expect(puts).toEqual([
        { totalAmount: 2_000_000, lines: [{ categoryId: 'k1', amount: 600_000 }] },
      ]),
    );
  });

  it('shows the usage per category and the projection', async () => {
    mockApi({
      ...me,
      [`GET /budgets/${month}`]: () => ({
        status: 200,
        body: {
          budget: filled(
            month,
            [{ ...line('l1', food, 600_000), spent: 570_000, remaining: 30_000, usage: 0.95 }],
            {
              total: { budget: 2_000_000, spent: 1_200_000, remaining: 800_000, usage: 0.6 },
              projection: { projectedSpend: 2_400_000, exceedsOnDay: 25 },
              copiedFrom: previous,
            },
          ),
        },
      }),
    });
    renderWithProviders(<BudgetsPage />);
    expect(
      await screen.findByText('A este ritmo superarías el presupuesto el día 25.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Uso de Alimentación' })).toHaveAttribute(
      'aria-valuenow',
      '95',
    );
    expect(screen.getByText(/Copiamos el presupuesto de/)).toBeInTheDocument();
  });

  it('shows a sub-limit inside its parent line', async () => {
    mockApi({
      ...me,
      [`GET /budgets/${month}`]: () => ({
        status: 200,
        body: {
          budget: filled(month, [line('l1', food, 600_000), line('l2', market, 200_000)], {
            totalAmount: null,
          }),
        },
      }),
    });
    renderWithProviders(<BudgetsPage />);
    expect(await screen.findByText('dentro de Alimentación')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Uso de Mercado' })).toBeInTheDocument();
  });

  it('moves to the previous month', async () => {
    const fetchMock = mockApi({
      ...me,
      [`GET /budgets/${month}`]: () => ({ status: 200, body: { budget: empty(month) } }),
      [`GET /budgets/${previous}`]: () => ({ status: 200, body: { budget: empty(previous) } }),
    });
    renderWithProviders(<BudgetsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Mes anterior' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === `/api/budgets/${previous}`)).toBe(true),
    );
  });

  it('hides the old numbers while the next month is loading', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockApi({
      ...me,
      [`GET /budgets/${month}`]: () => ({
        status: 200,
        body: { budget: filled(month, [line('l1', food, 600_000)]) },
      }),
      [`GET /budgets/${previous}`]: async () => {
        await gate;
        return { status: 200, body: { budget: empty(previous) } };
      },
    });
    renderWithProviders(<BudgetsPage />);
    expect(await screen.findByRole('button', { name: 'Editar presupuesto' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(screen.queryByRole('button', { name: 'Editar presupuesto' })).toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Uso de Alimentación' })).toBeNull();
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    release();
    expect(await screen.findByRole('button', { name: 'Crear presupuesto' })).toBeEnabled();
  });

  it('shows the error of a line under its row', async () => {
    mockApi({
      ...me,
      [`GET /budgets/${month}`]: () => ({
        status: 200,
        body: { budget: filled(month, [line('l1', food, 600_000)]) },
      }),
      'GET /categories': () => ({ status: 200, body: { items: [food] } }),
      [`PUT /budgets/${month}`]: () => ({
        status: 400,
        body: {
          error: {
            code: 'INVALID_REFERENCE',
            message: 'Referencia inválida',
            fields: { 'lines.0.categoryId': 'Categoría no disponible' },
          },
        },
      }),
    });
    renderWithProviders(<BudgetsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar presupuesto' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));
    expect(await screen.findByText('Categoría no disponible')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks deleted categories in the editor', async () => {
    mockApi({
      ...me,
      [`GET /budgets/${month}`]: () => ({
        status: 200,
        body: { budget: filled(month, [line('l1', food, 600_000, false)]) },
      }),
      'GET /categories': () => ({
        status: 200,
        body: { items: [{ ...food, isActive: false }] },
      }),
    });
    renderWithProviders(<BudgetsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar presupuesto' }));
    expect(await screen.findByLabelText('Alimentación (eliminada)')).toBeInTheDocument();
    expect(screen.getByText('Quítala para guardar')).toBeInTheDocument();
  });

  it('explains a sub-limit when the parent is already a line', async () => {
    mockApi({
      ...me,
      [`GET /budgets/${month}`]: () => ({
        status: 200,
        body: { budget: filled(month, [line('l1', food, 600_000)]) },
      }),
      'GET /categories': () => ({ status: 200, body: { items: [food, market] } }),
    });
    renderWithProviders(<BudgetsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar presupuesto' }));
    await userEvent.selectOptions(await screen.findByLabelText('Agregar categoría'), 'k2');
    expect(screen.getByText(/sublímite dentro de Alimentación/)).toBeInTheDocument();
  });

  it('toasts the error when clearing fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockApi({
        ...me,
        [`GET /budgets/${month}`]: () => ({
          status: 200,
          body: { budget: filled(month, [line('l1', food, 600_000)]) },
        }),
        [`DELETE /budgets/${month}`]: () => ({
          status: 500,
          body: { error: { code: 'INTERNAL', message: 'No se pudo eliminar' } },
        }),
      });
      renderWithProviders(<BudgetsPage />);
      await screen.findByRole('button', { name: 'Eliminar presupuesto' });
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar presupuesto' }));
      await vi.advanceTimersByTimeAsync(500);
      await userEvent.click(screen.getByRole('button', { name: '¿Seguro? Toca de nuevo' }));
      expect(await screen.findByText('No se pudo eliminar')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BudgetsPage days left (final review M1)', () => {
  it.each([
    [1, 'queda 1 día'],
    [2, 'quedan 2 días'],
  ])('with %i day(s) left says "%s"', async (daysLeft, text) => {
    mockApi({
      ...me,
      [`GET /budgets/${month}`]: () => ({
        status: 200,
        body: { budget: filled(month, [line('l1', food, 600_000)], { daysLeft }) },
      }),
      'GET /categories': () => ({ status: 200, body: { items: [food] } }),
    });
    renderWithProviders(<BudgetsPage />);
    expect(await screen.findByText(new RegExp(`· ${text}$`))).toBeInTheDocument();
  });
});
