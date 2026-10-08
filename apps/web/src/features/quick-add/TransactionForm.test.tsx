import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayIn, type TransactionDTO } from '@finanzas/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { TransactionForm } from './TransactionForm';

const accounts = [
  {
    id: 'a1',
    name: 'Nequi',
    type: 'DIGITAL_WALLET',
    institution: null,
    initialBalance: 0,
    openingDate: '2026-10-01',
    icon: 'smartphone',
    color: '#7c3aed',
    isActive: true,
    sortOrder: 0,
    balance: 300_000,
  },
];
const cards = [
  {
    id: 'c1',
    name: 'Nu Crédito',
    isActive: true,
    debt: 0,
    available: 5_000_000,
    creditLimit: 5_000_000,
    color: '#820ad1',
    icon: 'credit-card',
  },
];
const categories = [
  {
    id: 'k1',
    name: 'Alimentación',
    kind: 'EXPENSE',
    parentId: null,
    bucket: 'OBLIGATIONS',
    icon: 'utensils',
    color: '#f97316',
    isSystem: false,
    systemKey: null,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'k2',
    name: 'Salario',
    kind: 'INCOME',
    parentId: null,
    bucket: null,
    icon: 'briefcase',
    color: '#16a34a',
    isSystem: false,
    systemKey: null,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'k3',
    name: 'Ajuste de saldo',
    kind: 'EXPENSE',
    parentId: null,
    bucket: 'OTHER',
    icon: 'scale',
    color: '#94a3b8',
    isSystem: true,
    systemKey: 'ADJUSTMENT_EXPENSE',
    isActive: true,
    sortOrder: 3,
  },
];

let posted: unknown[] = [];
let release: () => void = () => undefined;

function setup(slowSave = false, extra: Parameters<typeof mockApi>[0] = {}) {
  posted = [];
  return mockApi({
    'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
    'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
    'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
    'GET /categories': () => ({ status: 200, body: { items: categories } }),
    'GET /scheduled/suggestions': () => ({ status: 200, body: { items: [] } }),
    'POST /transactions': async (body) => {
      posted.push(body);
      if (slowSave) await new Promise<void>((resolve) => (release = resolve));
      return { status: 201, body: { transaction: { id: 't1' }, warnings: [] } };
    },
    ...extra,
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('TransactionForm (expense)', () => {
  it('saves an expense paid from an account in a few taps', async () => {
    setup();
    const onDone = vi.fn();
    renderWithProviders(<TransactionForm mode="expense" onDone={onDone} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '25000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    expect(screen.queryByRole('radio', { name: /Ajuste de saldo/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(posted[0]).toMatchObject({
      type: 'EXPENSE',
      amount: 25000,
      accountId: 'a1',
      categoryId: 'k1',
      date: expect.any(String),
    });
  });

  it('becomes a card purchase with installments when a card is chosen', async () => {
    setup();
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '1200000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    expect(screen.queryByLabelText('Cuotas')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Nu Crédito/ }));
    const installments = screen.getByLabelText('Cuotas');
    await userEvent.clear(installments);
    await userEvent.type(installments, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      type: 'CARD_PURCHASE',
      amount: 1_200_000,
      creditCardId: 'c1',
      installments: 12,
    });
    expect(posted[0]).not.toHaveProperty('accountId');
  });

  it('requires amount and category before saving', async () => {
    setup();
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe un valor mayor que $0')).toBeInTheDocument();
    expect(screen.getByText('Elige una categoría')).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it('disables Guardar while saving so a double tap creates one movement (review focus #1)', async () => {
    setup(true);
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '5000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    const save = screen.getByRole('button', { name: 'Guardar' });
    await userEvent.dblClick(save);
    await waitFor(() => expect(posted).toHaveLength(1));
    await waitFor(() => expect(save).toBeDisabled());
    expect(posted).toHaveLength(1);
    release();
  });
});

describe('TransactionForm (card purchase without cards)', () => {
  it('shows an empty state instead of recording an account expense', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: [] } }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
    });
    renderWithProviders(<TransactionForm mode="expense" preferCard onDone={() => undefined} />);
    expect(await screen.findByText('No tienes tarjetas registradas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });
});

describe('TransactionForm (income)', () => {
  it('only offers accounts and income categories', async () => {
    setup();
    renderWithProviders(<TransactionForm mode="income" onDone={() => undefined} />);
    await screen.findByRole('radio', { name: /Salario/ });
    expect(screen.queryByRole('radio', { name: /Alimentación/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Nu Crédito/ })).not.toBeInTheDocument();
  });
});

describe('TransactionForm (edit and errors)', () => {
  it('keeps payee and notes the form does not expose when editing an expense', async () => {
    const puts: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
      'PUT /transactions/t9': (body) => {
        puts.push(body);
        return { status: 200, body: { transaction: { id: 't9' }, warnings: [] } };
      },
    });
    const edit = {
      id: 't9',
      type: 'EXPENSE',
      amount: 8000,
      date: '2026-10-05',
      description: 'Almuerzo',
      payee: 'Tienda',
      notes: 'nota',
      tags: [],
      installments: null,
      paymentMethod: null,
      interest: 0,
      goalId: null,
      account: { id: 'a1', name: 'Nequi' },
      category: { id: 'k1', name: 'Alimentación' },
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ payee: 'Tienda', notes: 'nota' });
  });

  it('refuses to edit movement types it does not handle', async () => {
    setup();
    const edit = {
      id: 't1',
      type: 'TRANSFER',
      amount: 1,
      date: '2026-10-05',
      tags: [],
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    expect(
      await screen.findByText('Este movimiento no se puede editar desde aquí.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('switches an expense to a card purchase when a card is chosen (addendum §4)', async () => {
    const puts: Record<string, unknown>[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
      'PUT /transactions/t9': (body) => {
        puts.push(body as Record<string, unknown>);
        return { status: 200, body: { transaction: { id: 't9' }, warnings: [] } };
      },
    });
    const edit = {
      id: 't9',
      type: 'EXPENSE',
      amount: 8000,
      date: '2026-10-05',
      description: null,
      payee: null,
      notes: null,
      tags: [],
      installments: null,
      paymentMethod: null,
      account: { id: 'a1', name: 'Nequi', isActive: true },
      creditCard: null,
      category: { id: 'k1', name: 'Alimentación', isActive: true },
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('radio', { name: /Nu Crédito/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ type: 'CARD_PURCHASE', creditCardId: 'c1', installments: 1 });
    expect(puts[0]).not.toHaveProperty('accountId');
  });

  it('locks money fields of a movement whose account was deleted (review focus #5)', async () => {
    const puts: Record<string, unknown>[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({
        status: 200,
        body: { items: [{ ...accounts[0], isActive: false }] },
      }),
      'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
      'PUT /transactions/t9': (body) => {
        puts.push(body as Record<string, unknown>);
        return { status: 200, body: { transaction: { id: 't9' }, warnings: [] } };
      },
    });
    const edit = {
      id: 't9',
      type: 'EXPENSE',
      amount: 8000,
      date: '2026-10-05',
      description: null,
      payee: null,
      notes: null,
      tags: [],
      installments: null,
      paymentMethod: null,
      account: { id: 'a1', name: 'Nequi', isActive: false },
      creditCard: null,
      category: { id: 'k1', name: 'Alimentación', isActive: true },
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    expect(await screen.findByLabelText('Valor')).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(
      '"Nequi" fue eliminada: solo puedes cambiar la categoría, la descripción, las etiquetas y las notas. Restáurala',
    );
    expect(screen.queryByRole('radio', { name: /Nu Crédito/ })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Descripción (opcional)'), 'Mercado');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      type: 'EXPENSE',
      amount: 8000,
      date: '2026-10-05',
      categoryId: 'k1',
      accountId: 'a1',
      paymentMethod: null,
      description: 'Mercado',
      notes: null,
      tags: [],
      payee: null,
    });
  });

  it('switches a card purchase back to an expense when an account is chosen', async () => {
    const puts: Record<string, unknown>[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
      'PUT /transactions/t9': (body) => {
        puts.push(body as Record<string, unknown>);
        return { status: 200, body: { transaction: { id: 't9' }, warnings: [] } };
      },
    });
    const edit = {
      id: 't9',
      type: 'CARD_PURCHASE',
      amount: 8000,
      date: '2026-10-05',
      description: null,
      payee: null,
      notes: null,
      tags: [],
      installments: 1,
      paymentMethod: null,
      account: null,
      creditCard: { id: 'c1', name: 'Nu Crédito', isActive: true },
      category: { id: 'k1', name: 'Alimentación', isActive: true },
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('radio', { name: /Nequi/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      type: 'EXPENSE',
      amount: 8000,
      date: '2026-10-05',
      categoryId: 'k1',
      description: null,
      notes: null,
      tags: [],
      accountId: 'a1',
      paymentMethod: null,
      payee: null,
    });
  });

  it('keeps the installments of a frozen card purchase', async () => {
    const puts: Record<string, unknown>[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
      'GET /credit-cards': () => ({
        status: 200,
        body: { items: [{ ...cards[0], isActive: false }] },
      }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
      'PUT /transactions/t9': (body) => {
        puts.push(body as Record<string, unknown>);
        return { status: 200, body: { transaction: { id: 't9' }, warnings: [] } };
      },
    });
    const edit = {
      id: 't9',
      type: 'CARD_PURCHASE',
      amount: 90_000,
      date: '2026-10-05',
      description: null,
      payee: null,
      notes: null,
      tags: [],
      installments: 3,
      paymentMethod: null,
      account: null,
      creditCard: { id: 'c1', name: 'Nu Crédito', isActive: false },
      category: { id: 'k1', name: 'Alimentación', isActive: true },
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    expect(await screen.findByLabelText('Cuotas')).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('"Nu Crédito" fue eliminada');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      type: 'CARD_PURCHASE',
      amount: 90_000,
      date: '2026-10-05',
      categoryId: 'k1',
      creditCardId: 'c1',
      installments: 3,
      description: null,
      notes: null,
      tags: [],
      payee: null,
    });
  });

  it('shows the server message when the edit hits ENTITY_DELETED', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
      'PUT /transactions/t9': () => ({
        status: 409,
        body: { error: { code: 'ENTITY_DELETED', message: 'La cuenta fue eliminada' } },
      }),
    });
    const edit = {
      id: 't9',
      type: 'EXPENSE',
      amount: 8000,
      date: '2026-10-05',
      description: null,
      payee: null,
      notes: null,
      tags: [],
      installments: null,
      paymentMethod: null,
      account: { id: 'a1', name: 'Nequi', isActive: true },
      creditCard: null,
      category: { id: 'k1', name: 'Alimentación', isActive: true },
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La cuenta fue eliminada');
  });

  it('shows the general message when the server rejects a field the form does not render', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
      'POST /transactions': () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Revisa los datos ingresados.',
            fields: { notes: 'Muy largo' },
          },
        },
      }),
    });
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '5000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los datos ingresados.');
  });
});

describe('TransactionForm (recurring and links, spec 8.11)', () => {
  const pending = {
    id: 's1',
    kind: 'EXPENSE',
    name: 'Arriendo',
    amount: 1_000_000,
    dueDate: '2026-10-05',
    ruleDate: '2026-10-05',
    status: 'PENDING',
    category: null,
    account: null,
    creditCard: null,
    recurringRuleId: 'r1',
    transactionId: null,
    derived: null,
    sourceId: null,
  };
  const suggestions = (items: unknown[]) => ({
    'GET /scheduled/suggestions': () => ({ status: 200, body: { items } }),
  });

  async function fillExpense() {
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '1000000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
  }

  it('asks whether it is the payment of a pending obligation and links it', async () => {
    setup(false, suggestions([pending]));
    await fillExpense();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Arriendo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, enlazar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ type: 'EXPENSE', amount: 1_000_000, scheduledItemId: 's1' });
  });

  it('saves without linking when the user says it is another expense', async () => {
    setup(false, suggestions([pending]));
    await fillExpense();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'No, es otro' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).not.toHaveProperty('scheduledItemId');
  });

  it('marks an expense as recurring without asking when no rule covers it', async () => {
    const fetchMock = setup(false, suggestions([{ ...pending, recurringRuleId: null }]));
    await fillExpense();
    await userEvent.click(screen.getByRole('button', { name: /Más opciones/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Recurrente (se repite)' }));
    expect(screen.getByLabelText('Frecuencia')).toHaveValue('MONTHLY');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ recurring: { frequency: 'MONTHLY' } });
    expect(screen.queryByRole('button', { name: 'Sí, enlazar' })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/scheduled/suggestions')),
    ).toBe(true);
  });

  it('shows nested recurrence errors inside the Recurrente box (ruling A2)', async () => {
    setup(false, {
      'POST /transactions': () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Revisa los datos ingresados.',
            fields: { 'recurring.day1': 'La fecha debe ser uno de los dos días' },
          },
        },
      }),
    });
    await fillExpense();
    await userEvent.click(screen.getByRole('button', { name: /Más opciones/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Recurrente (se repite)' }));
    await userEvent.selectOptions(screen.getByLabelText('Frecuencia'), 'SEMIMONTHLY');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('La fecha debe ser uno de los dos días')).toBeInTheDocument();
    expect(screen.queryByText('Revisa los datos ingresados.')).not.toBeInTheDocument();
  });

  it('shows the server message when the suggested item is no longer pending and lets the user save again', async () => {
    let attempts = 0;
    setup(false, {
      ...suggestions([pending]),
      'POST /transactions': (body) => {
        posted.push(body);
        attempts += 1;
        return attempts === 1
          ? {
              status: 409,
              body: {
                error: { code: 'NOT_PENDING', message: 'Esa obligación ya no está pendiente' },
              },
            }
          : { status: 201, body: { transaction: { id: 't1' }, warnings: [] } };
      },
    });
    const onDone = vi.fn();
    renderWithProviders(<TransactionForm mode="expense" onDone={onDone} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '1000000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, enlazar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esa obligación ya no está pendiente',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'No, es otro' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(posted[1]).not.toHaveProperty('scheduledItemId');
  });
});

describe('TransactionForm (fix round 1: stale link, focus, hidden errors)', () => {
  const pending = {
    id: 's1',
    kind: 'EXPENSE',
    name: 'Arriendo',
    amount: 1_000_000,
    dueDate: '2026-10-05',
    ruleDate: '2026-10-05',
    status: 'PENDING',
    category: null,
    account: null,
    creditCard: null,
    recurringRuleId: 'r1',
    transactionId: null,
    derived: null,
    sourceId: null,
  };
  const withItems = (items: unknown[]) => ({
    'GET /scheduled/suggestions': () => ({ status: 200, body: { items } }),
  });

  async function fill(value = '1000000') {
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), value);
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
  }

  it('drops the prompt when the amount changes and posts the new amount unlinked', async () => {
    setup(false, withItems([pending]));
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('button', { name: 'Sí, enlazar' });
    await userEvent.type(screen.getByLabelText('Valor'), '0');
    expect(screen.queryByRole('button', { name: 'Sí, enlazar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'No, es otro' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ amount: 10_000_000 });
    expect(posted[0]).not.toHaveProperty('scheduledItemId');
  });

  it('announces the prompt and moves focus to Sí, enlazar', async () => {
    setup(false, withItems([pending]));
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    const yes = await screen.findByRole('button', { name: 'Sí, enlazar' });
    await waitFor(() => expect(yes).toHaveFocus());
    expect(screen.getByRole('status', { name: 'Sugerencia de enlace' })).toBeInTheDocument();
  });

  it('opens Más opciones when the server rejects the recurrence', async () => {
    setup(false, {
      'POST /transactions': () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Revisa los datos ingresados.',
            fields: { 'recurring.day1': 'Día no válido' },
          },
        },
      }),
    });
    await fill();
    await userEvent.click(screen.getByRole('button', { name: /Más opciones/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Recurrente (se repite)' }));
    await userEvent.click(screen.getByRole('button', { name: /Más opciones/ }));
    expect(screen.queryByRole('checkbox', { name: 'Recurrente (se repite)' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Día no válido')).toBeInTheDocument();
  });

  it('never sends scheduledItemId and recurring together', async () => {
    setup(false, withItems([pending]));
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, enlazar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toHaveProperty('scheduledItemId', 's1');
    expect(posted[0]).not.toHaveProperty('recurring');
  });

  it('a recurring save carries recurring and no scheduledItemId', async () => {
    setup(false, withItems([{ ...pending, recurringRuleId: null }]));
    await fill();
    await userEvent.click(screen.getByRole('button', { name: /Más opciones/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Recurrente (se repite)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toHaveProperty('recurring');
    expect(posted[0]).not.toHaveProperty('scheduledItemId');
  });

  it('a double tap while looking for suggestions shows one prompt and posts once', async () => {
    setup(false, withItems([pending]));
    await fill();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findAllByRole('button', { name: 'Sí, enlazar' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Sí, enlazar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toHaveProperty('scheduledItemId', 's1');
  });

  it.each([
    ['404', {}],
    [
      'network error',
      {
        'GET /scheduled/suggestions': () => {
          throw new TypeError('network');
        },
      },
    ],
  ])('saves normally when the suggestions request fails (%s)', async (_name, extra) => {
    setup(false, extra);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).not.toHaveProperty('scheduledItemId');
  });
});

describe('TransactionForm (fix round 2: answer uses current form state)', () => {
  const pending = {
    id: 's1',
    kind: 'EXPENSE',
    name: 'Arriendo',
    amount: 1_000_000,
    dueDate: '2026-10-05',
    ruleDate: '2026-10-05',
    status: 'PENDING',
    category: null,
    account: null,
    creditCard: null,
    recurringRuleId: 'r1',
    transactionId: null,
    derived: null,
    sourceId: null,
  };
  const items = {
    'GET /scheduled/suggestions': () => ({ status: 200, body: { items: [pending] } }),
  };

  it('posts the current description when it changes while the prompt is up', async () => {
    setup(false, items);
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '1000000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('button', { name: 'Sí, enlazar' });
    await userEvent.type(screen.getByLabelText('Descripción (opcional)'), 'Octubre');
    await userEvent.click(screen.getByRole('button', { name: 'Sí, enlazar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ description: 'Octubre', scheduledItemId: 's1' });
  });

  it('posts the current installments of a card purchase changed under the prompt', async () => {
    setup(false, items);
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '1000000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Nu Crédito/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('button', { name: 'No, es otro' });
    const cuotas = screen.getByLabelText('Cuotas');
    await userEvent.clear(cuotas);
    await userEvent.type(cuotas, '6');
    await userEvent.click(screen.getByRole('button', { name: 'Sí, enlazar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ installments: 6, scheduledItemId: 's1' });
  });

  it('does not send when the current state is invalid at answer time', async () => {
    setup(false, items);
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '1000000');
    await userEvent.click(screen.getByRole('radio', { name: /Nu Crédito/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByRole('button', { name: 'Sí, enlazar' });
    await userEvent.clear(screen.getByLabelText('Cuotas'));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, enlazar' }));
    expect(await screen.findByText('Entre 1 y 48 cuotas')).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });
});

describe('TransactionForm (Fase 3: recurrente que ya existía, pendiente 4)', () => {
  const today = todayIn('America/Bogota');
  const ruleItem = {
    id: 's1',
    kind: 'EXPENSE',
    name: 'Arriendo',
    amount: 1_000_000,
    dueDate: today,
    ruleDate: today,
    status: 'PENDING',
    category: null,
    account: null,
    creditCard: null,
    recurringRuleId: 'r1',
    transactionId: null,
    derived: null,
    sourceId: null,
  };
  const oneOff = { ...ruleItem, id: 's2', name: 'Arreglo del techo', recurringRuleId: null };
  const expense = {
    type: 'EXPENSE',
    amount: 1_000_000,
    date: today,
    categoryId: 'k1',
    description: null,
    notes: null,
    tags: [],
    accountId: 'a1',
    paymentMethod: null,
  };

  /** Llena un gasto, marca "Recurrente" y toca Guardar; `null` simula que las sugerencias fallan. */
  async function saveRecurring(items: unknown[] | null) {
    const fetchMock = setup(false, {
      'GET /scheduled/suggestions': () =>
        items === null
          ? { status: 500, body: { error: { code: 'INTERNAL', message: 'Error' } } }
          : { status: 200, body: { items } },
    });
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '1000000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(screen.getByRole('button', { name: /Más opciones/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Recurrente (se repite)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    return fetchMock;
  }

  it('asks about the existing rule and links the occurrence without creating a rule', async () => {
    await saveRecurring([ruleItem]);
    const yes = await screen.findByRole('button', { name: 'Sí, enlazar' });
    expect(screen.getByRole('status', { name: 'Sugerencia de enlace' })).toHaveTextContent(
      'Ya tienes «Arriendo» como recurrente. ¿Es este pago?',
    );
    await waitFor(() => expect(yes).toHaveFocus());
    await userEvent.click(yes);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted).toEqual([{ ...expense, scheduledItemId: 's1' }]);
  });

  it('creates the new rule, without scheduledItemId, when the answer is No', async () => {
    await saveRecurring([ruleItem]);
    await userEvent.click(await screen.findByRole('button', { name: 'No, es otro' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted).toEqual([{ ...expense, recurring: { frequency: 'MONTHLY' } }]);
  });

  it('builds the rule with the frequency chosen while the question is up', async () => {
    await saveRecurring([ruleItem]);
    await screen.findByRole('button', { name: 'Sí, enlazar' });
    await userEvent.selectOptions(screen.getByLabelText('Frecuencia'), 'WEEKLY');
    await userEvent.click(screen.getByRole('button', { name: 'No, es otro' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted).toEqual([{ ...expense, recurring: { frequency: 'WEEKLY' } }]);
  });

  it('asks about the rule occurrence even when a one-off comes first', async () => {
    await saveRecurring([oneOff, ruleItem]);
    expect(await screen.findByRole('status', { name: 'Sugerencia de enlace' })).toHaveTextContent(
      'Ya tienes «Arriendo» como recurrente.',
    );
  });

  it('ignores suggestions that do not belong to a rule and creates the rule', async () => {
    const fetchMock = await saveRecurring([oneOff]);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted).toEqual([{ ...expense, recurring: { frequency: 'MONTHLY' } }]);
    expect(screen.queryByRole('button', { name: 'Sí, enlazar' })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/scheduled/suggestions')),
    ).toHaveLength(1);
  });

  it('creates the rule when the suggestions request fails', async () => {
    await saveRecurring(null);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted).toEqual([{ ...expense, recurring: { frequency: 'MONTHLY' } }]);
  });
});

describe('TransactionForm system categories (final review M6)', () => {
  const adjustment = {
    id: 't8',
    type: 'EXPENSE',
    amount: 5000,
    date: '2026-10-05',
    description: null,
    payee: null,
    notes: null,
    tags: [],
    installments: null,
    paymentMethod: null,
    interest: 0,
    goalId: null,
    account: { id: 'a1', name: 'Nequi' },
    category: { id: 'k3', name: 'Ajuste de saldo' },
  } as unknown as TransactionDTO;

  it('shows the system category of the movement being edited as selected', async () => {
    setup();
    renderWithProviders(
      <TransactionForm mode="expense" edit={adjustment} onDone={() => undefined} />,
    );
    const chip = await screen.findByRole('radio', { name: /Ajuste de saldo/ });
    expect(chip).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps system categories out of a new movement', async () => {
    setup();
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    expect(await screen.findByRole('radio', { name: /Alimentación/ })).toBeInTheDocument();
    expect(screen.queryByText(/Ajuste de saldo/)).not.toBeInTheDocument();
  });
});
