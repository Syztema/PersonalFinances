import { addDays, todayIn } from '@finanzas/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { QuickAddProvider, useQuickAdd } from '../quick-add/QuickAddContext';
import { RecurringPage } from './RecurringPage';

afterEach(() => vi.unstubAllGlobals());

const today = todayIn('America/Bogota');
const accountRef = {
  id: 'a1',
  name: 'Bancolombia',
  icon: 'landmark',
  color: '#ca8a04',
  isActive: true,
  type: 'BANK',
};
const account = {
  ...accountRef,
  institution: null,
  initialBalance: 0,
  openingDate: '2026-01-01',
  sortOrder: 0,
  balance: 2_000_000,
};
const category = {
  id: 'k1',
  name: 'Vivienda',
  kind: 'EXPENSE',
  parentId: null,
  bucket: 'OBLIGATIONS',
  icon: 'home',
  color: '#0ea5e9',
  isSystem: false,
  systemKey: null,
  isActive: true,
  sortOrder: 0,
};
const item = (over: Record<string, unknown>) => ({
  id: 's1',
  kind: 'EXPENSE',
  name: 'Arriendo',
  amount: 1_000_000,
  dueDate: addDays(today, -2),
  ruleDate: addDays(today, -2),
  status: 'PENDING',
  category: { ...category, isActive: true },
  account: accountRef,
  creditCard: null,
  recurringRuleId: 'r1',
  transactionId: null,
  derived: null,
  sourceId: null,
  ...over,
});
const rule = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  name: 'Arriendo',
  kind: 'EXPENSE',
  amount: 1_000_000,
  category: { ...category },
  account: accountRef,
  creditCard: null,
  frequency: 'MONTHLY',
  intervalDays: null,
  day1: null,
  day2: null,
  startDate: '2026-01-01',
  endDate: null,
  isActive: true,
  nextDate: addDays(today, 10),
  ...over,
});
const notPending = {
  status: 409,
  body: { error: { code: 'NOT_PENDING', message: 'Esta ocurrencia ya no está pendiente' } },
};

function setup(routes: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
    'GET /scheduled': () => ({
      status: 200,
      body: {
        items: [
          item({}),
          item({
            id: 'card:c1',
            name: 'Pago Nu Crédito',
            dueDate: addDays(today, 5),
            ruleDate: null,
            derived: 'CARD',
            sourceId: 'c1',
            recurringRuleId: null,
            account: null,
            creditCard: {
              id: 'c1',
              name: 'Nu Crédito',
              icon: 'credit-card',
              color: '#7c3aed',
              isActive: true,
            },
            category: null,
          }),
        ],
      },
    }),
    'GET /recurring': () => ({ status: 200, body: { items: [] } }),
    'GET /accounts': () => ({ status: 200, body: { items: [account] } }),
    'GET /credit-cards': () => ({ status: 200, body: { items: [] } }),
    'GET /categories': () => ({ status: 200, body: { items: [category] } }),
    ...routes,
  });
}

const render = () =>
  renderWithProviders(
    <QuickAddProvider>
      <RecurringPage />
    </QuickAddProvider>,
  );

const listCalls = (fetchMock: ReturnType<typeof setup>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/scheduled?')).length;

describe('RecurringPage (spec 8.11)', () => {
  it('lists what is due in the next 30 days, overdue first, with card dues', async () => {
    setup();
    render();
    expect(await screen.findByText('Arriendo')).toBeInTheDocument();
    expect(screen.getByText(/Vencida el/)).toBeInTheDocument();
    expect(screen.getByText('Pago Nu Crédito')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver tarjeta' })).toHaveAttribute('href', '/cards/c1');
  });

  it('pays an obligation once even with a double tap (review focus #1)', async () => {
    const completed: unknown[] = [];
    let release: () => void = () => undefined;
    setup({
      'POST /scheduled/s1/complete': async (body) => {
        completed.push(body);
        await new Promise<void>((resolve) => (release = resolve));
        return { status: 201, body: { transaction: { id: 't1' }, warnings: [] } };
      },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar Arriendo' }));
    const save = await screen.findByRole('button', { name: 'Guardar pago' });
    await userEvent.dblClick(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(completed).toEqual([{ amount: 1_000_000, date: addDays(today, -2), accountId: 'a1' }]);
    release();
  });

  it('skips an occurrence', async () => {
    const skipped: string[] = [];
    setup({
      'POST /scheduled/s1/skip': () => {
        skipped.push('s1');
        return { status: 200, body: { item: item({ status: 'SKIPPED' }) } };
      },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Omitir Arriendo' }));
    await waitFor(() => expect(skipped).toEqual(['s1']));
  });

  it('skips once on a double tap and shows the row as busy', async () => {
    const skipped: string[] = [];
    let release: () => void = () => undefined;
    setup({
      'POST /scheduled/s1/skip': async () => {
        skipped.push('s1');
        await new Promise<void>((resolve) => (release = resolve));
        return { status: 200, body: { item: item({ status: 'SKIPPED' }) } };
      },
    });
    render();
    const skip = await screen.findByRole('button', { name: 'Omitir Arriendo' });
    await userEvent.dblClick(skip);
    await waitFor(() => expect(skip).toBeDisabled());
    expect(skipped).toEqual(['s1']);
    release();
  });

  it('refreshes the list and closes the sheet when completing hits a 409 NOT_PENDING', async () => {
    const fetchMock = setup({ 'POST /scheduled/s1/complete': () => notPending });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar Arriendo' }));
    await waitFor(() => expect(listCalls(fetchMock)).toBe(1));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar pago' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Esta ocurrencia ya no está pendiente',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(listCalls(fetchMock)).toBeGreaterThan(1));
  });

  it('refreshes the list and warns when skipping hits a 409', async () => {
    const fetchMock = setup({ 'POST /scheduled/s1/skip': () => notPending });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Omitir Arriendo' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Esta ocurrencia ya no está pendiente',
    );
    await waitFor(() => expect(listCalls(fetchMock)).toBeGreaterThan(1));
  });

  it('only offers Eliminar on one-off items', async () => {
    setup({
      'GET /scheduled': () => ({
        status: 200,
        body: { items: [item({}), item({ id: 's2', name: 'Soat', recurringRuleId: null })] },
      }),
    });
    render();
    await screen.findByText('Soat');
    expect(screen.getAllByRole('button', { name: /^Eliminar / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Eliminar Soat' })).toBeInTheDocument();
  });

  it('creates a monthly rule', async () => {
    const posted: unknown[] = [];
    setup({
      'POST /recurring': (body) => {
        posted.push(body);
        return { status: 201, body: { rule: {} } };
      },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva regla' }));
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Internet');
    await userEvent.type(screen.getByLabelText('Valor'), '90000');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'k1');
    await userEvent.selectOptions(screen.getByLabelText('Cuenta o tarjeta'), 'account:a1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar regla' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: 'k1',
      accountId: 'a1',
      creditCardId: null,
      frequency: 'MONTHLY',
      intervalDays: null,
      day1: null,
      day2: null,
      startDate: today,
      endDate: null,
    });
  });

  it('pauses a rule with the full rule plus isActive, once on a double tap', async () => {
    const puts: unknown[] = [];
    let release: () => void = () => undefined;
    setup({
      'GET /recurring': () => ({ status: 200, body: { items: [rule()] } }),
      'PUT /recurring/r1': async (body) => {
        puts.push(body);
        await new Promise<void>((resolve) => (release = resolve));
        return { status: 200, body: { rule: rule({ isActive: false }) } };
      },
    });
    render();
    const pause = await screen.findByRole('button', { name: 'Pausar Arriendo' });
    await userEvent.dblClick(pause);
    await waitFor(() => expect(pause).toBeDisabled());
    expect(puts).toEqual([
      {
        name: 'Arriendo',
        kind: 'EXPENSE',
        amount: 1_000_000,
        categoryId: 'k1',
        accountId: 'a1',
        creditCardId: null,
        frequency: 'MONTHLY',
        intervalDays: null,
        day1: null,
        day2: null,
        startDate: '2026-01-01',
        endDate: null,
        isActive: false,
      },
    ]);
    release();
  });

  it('keeps a deleted category selectable, marked, when editing a rule', async () => {
    const deleted = { ...category, id: 'k9', name: 'Antigua', isActive: false };
    setup({
      'GET /recurring': () => ({
        status: 200,
        body: { items: [rule({ name: 'Plan celular', category: deleted })] },
      }),
      'GET /categories': () => ({ status: 200, body: { items: [category, deleted] } }),
    });
    render();
    await userEvent.click(await screen.findByText('Plan celular'));
    const select = await screen.findByLabelText('Categoría');
    expect(within(select).getByRole('option', { name: 'Antigua (eliminada)' })).toBeInTheDocument();
    expect(select).toHaveValue('k9');
  });

  it('keeps each row busy on its own and reports a 409 on the first row', async () => {
    const releases: Record<string, () => void> = {};
    setup({
      'GET /scheduled': () => ({
        status: 200,
        body: { items: [item({}), item({ id: 's2', name: 'Soat', recurringRuleId: null })] },
      }),
      'POST /scheduled/s1/skip': async () => {
        await new Promise<void>((resolve) => (releases.s1 = resolve));
        return notPending;
      },
      'POST /scheduled/s2/skip': async () => {
        await new Promise<void>((resolve) => (releases.s2 = resolve));
        return { status: 200, body: { item: item({ id: 's2', status: 'SKIPPED' }) } };
      },
    });
    render();
    const a = await screen.findByRole('button', { name: 'Omitir Arriendo' });
    const b = await screen.findByRole('button', { name: 'Omitir Soat' });
    await userEvent.click(a);
    await userEvent.click(b);
    await waitFor(() => expect(a).toBeDisabled());
    expect(b).toBeDisabled();
    releases.s1?.();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Esta ocurrencia ya no está pendiente',
    );
    releases.s2?.();
  });

  it('creates a one-off obligation with the exact body', async () => {
    const posted: unknown[] = [];
    setup({
      'POST /scheduled': (body) => {
        posted.push(body);
        return { status: 201, body: { item: item({}) } };
      },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo pago único' }));
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Soat');
    await userEvent.type(screen.getByLabelText('Valor'), '500000');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'k1');
    await userEvent.selectOptions(screen.getByLabelText('Cuenta o tarjeta'), 'account:a1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      kind: 'EXPENSE',
      name: 'Soat',
      amount: 500_000,
      dueDate: today,
      categoryId: 'k1',
      accountId: 'a1',
      creditCardId: null,
    });
  });

  it('edits an occurrence without sending kind', async () => {
    const puts: unknown[] = [];
    setup({
      'PUT /scheduled/s1': (body) => {
        puts.push(body);
        return { status: 200, body: { item: item({}) } };
      },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Arriendo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      name: 'Arriendo',
      amount: 1_000_000,
      dueDate: addDays(today, -2),
      categoryId: 'k1',
      accountId: 'a1',
      creditCardId: null,
    });
  });

  it('opens the card payment from a derived due', async () => {
    setup();
    function Probe() {
      const { request } = useQuickAdd();
      return <p data-testid="req">{request ? `${request.kind}:${request.cardId}` : 'none'}</p>;
    }
    renderWithProviders(
      <QuickAddProvider>
        <RecurringPage />
        <Probe />
      </QuickAddProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar Pago Nu Crédito' }));
    expect(screen.getByTestId('req')).toHaveTextContent('card-payment:c1');
  });

  it('defaults the payment date to today for a future due date', async () => {
    const completed: unknown[] = [];
    setup({
      'GET /scheduled': () => ({
        status: 200,
        body: { items: [item({ dueDate: addDays(today, 6), ruleDate: addDays(today, 6) })] },
      }),
      'POST /scheduled/s1/complete': (body) => {
        completed.push(body);
        return { status: 201, body: { transaction: { id: 't1' }, warnings: [] } };
      },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar Arriendo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar pago' }));
    await waitFor(() => expect(completed).toHaveLength(1));
    expect(completed[0]).toMatchObject({ date: today });
  });

  it('validates the semimonthly days', async () => {
    setup();
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva regla' }));
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Quincena');
    await userEvent.type(screen.getByLabelText('Valor'), '1000');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'k1');
    await userEvent.selectOptions(screen.getByLabelText('Cuenta o tarjeta'), 'account:a1');
    await userEvent.selectOptions(screen.getByLabelText('Frecuencia'), 'SEMIMONTHLY');
    const day1 = screen.getByLabelText('Primer día');
    await userEvent.clear(day1);
    await userEvent.type(day1, '20');
    const day2 = screen.getByLabelText('Segundo día');
    await userEvent.clear(day2);
    await userEvent.type(day2, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar regla' }));
    expect(await screen.findByText('Debe ser posterior al primer día')).toBeInTheDocument();
  });
});

describe('RecurringPage income wording (final review M10)', () => {
  it('says an overdue income is expected since, and keeps "Vencida" for obligations', async () => {
    setup({
      'GET /scheduled': () => ({
        status: 200,
        body: {
          items: [
            item({}),
            item({
              id: 's2',
              kind: 'INCOME',
              name: 'Salario',
              amount: 3_000_000,
              dueDate: addDays(today, -1),
              ruleDate: addDays(today, -1),
            }),
          ],
        },
      }),
    });
    render();
    expect(await screen.findByText('Salario')).toBeInTheDocument();
    expect(screen.getAllByText(/Vencida el/)).toHaveLength(1);
    expect(screen.getAllByText(/Esperado desde el/)).toHaveLength(1);
  });
});
