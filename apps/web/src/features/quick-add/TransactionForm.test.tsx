import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TransactionDTO } from '@finanzas/shared';
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

function setup(slowSave = false) {
  posted = [];
  return mockApi({
    'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
    'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
    'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
    'GET /categories': () => ({ status: 200, body: { items: categories } }),
    'POST /transactions': async (body) => {
      posted.push(body);
      if (slowSave) await new Promise<void>((resolve) => (release = resolve));
      return { status: 201, body: { transaction: { id: 't1' }, warnings: [] } };
    },
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

  it('refuses to edit unsupported movement types', async () => {
    setup();
    const edit = {
      id: 't1',
      type: 'DEBT_DISBURSEMENT',
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
