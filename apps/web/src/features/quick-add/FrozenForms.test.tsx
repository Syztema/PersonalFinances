import type { TransactionDTO } from '@finanzas/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { DisbursementForm } from '../debts/DisbursementSheet';
import { PayCardForm } from './PayCardForm';
import { PayLoanForm } from './PayLoanForm';
import { TransferForm } from './TransferForm';

afterEach(() => vi.unstubAllGlobals());

const account = (id: string, name: string, isActive = true) => ({
  id,
  name,
  type: 'BANK',
  institution: null,
  initialBalance: 0,
  openingDate: '2026-10-01',
  icon: 'wallet',
  color: '#123456',
  isActive,
  sortOrder: 0,
  balance: 100_000,
});
const ref = (id: string, name: string, isActive = true) => ({
  id,
  name,
  icon: 'wallet',
  color: '#123456',
  isActive,
});
const base = {
  date: '2026-10-05',
  description: null,
  payee: null,
  notes: null,
  tags: [],
  goalId: null,
  installments: null,
  paymentMethod: null,
  method: null,
  parentId: null,
  interest: 0,
  category: null,
  toAccount: null,
  creditCard: null,
  debt: null,
};

type Route = () => { status: number; body: unknown };

function mockPut(extra: Record<string, Route> = {}) {
  const puts: Record<string, unknown>[] = [];
  mockApi({
    'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
    'PUT /transactions/t1': (body) => {
      puts.push(body as Record<string, unknown>);
      return { status: 200, body: { transaction: { id: 't1' }, warnings: [] } };
    },
    ...extra,
  });
  return puts;
}

describe('frozen movements of deleted holders (addendum §3.1)', () => {
  it('locks a transfer to a deleted account and still lets the description change', async () => {
    const puts = mockPut({
      'GET /accounts': () => ({
        status: 200,
        body: { items: [account('a1', 'Nequi'), account('a2', 'Ahorros', false)] },
      }),
    });
    const edit = {
      ...base,
      id: 't1',
      type: 'TRANSFER',
      amount: 50_000,
      account: ref('a1', 'Nequi'),
      toAccount: ref('a2', 'Ahorros', false),
    } as unknown as TransactionDTO;
    renderWithProviders(<TransferForm edit={edit} onDone={() => undefined} />);
    expect(await screen.findByLabelText('Valor')).toBeDisabled();
    expect(screen.getByLabelText('Desde')).toBeDisabled();
    expect(screen.getByLabelText('Hacia')).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(
      '"Ahorros" fue eliminada: solo puedes cambiar la descripción. Restáurala',
    );
    expect(screen.getAllByRole('option', { name: /Ahorros \(eliminada\)/ })).toHaveLength(2);
    await userEvent.type(screen.getByLabelText('Descripción (opcional)'), 'Ahorro');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      type: 'TRANSFER',
      amount: 50_000,
      date: '2026-10-05',
      accountId: 'a1',
      toAccountId: 'a2',
      description: 'Ahorro',
      goalId: null,
      tags: [],
      payee: null,
      notes: null,
    });
  });

  it('does not allow editing a card payment from a deleted account (no quick-fill, no save)', async () => {
    const puts = mockPut({
      'GET /accounts': () => ({
        status: 200,
        body: { items: [account('a1', 'Nequi', false)] },
      }),
      'GET /credit-cards': () => ({
        status: 200,
        body: {
          items: [
            {
              ...ref('c1', 'Nu Crédito'),
              debt: 400_000,
              amountDue: 100_000,
              dueDate: '2026-10-20',
              creditLimit: 1_000_000,
              available: 600_000,
            },
          ],
        },
      }),
    });
    const onDone = vi.fn();
    const edit = {
      ...base,
      id: 't1',
      type: 'CARD_PAYMENT',
      amount: 20_000,
      account: ref('a1', 'Nequi', false),
      creditCard: ref('c1', 'Nu Crédito'),
    } as unknown as TransactionDTO;
    renderWithProviders(<PayCardForm edit={edit} onDone={onDone} />);
    expect(await screen.findByRole('note')).toHaveTextContent(
      'Este movimiento no se puede editar porque Nequi fue eliminada. Restáurala para cambiarlo.',
    );
    expect(screen.queryByRole('button', { name: 'Pago total' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pago del mes' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Valor del pago')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar tarjeta' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onDone).toHaveBeenCalled();
    expect(puts).toHaveLength(0);
  });

  it('does not allow editing a loan payment of a deleted loan, with masculine agreement', async () => {
    const puts = mockPut({
      'GET /accounts': () => ({ status: 200, body: { items: [account('a1', 'Nequi')] } }),
      'GET /debts': () => ({
        status: 200,
        body: {
          items: [{ ...ref('d1', 'Libre inversión', false), balance: 500_000, installmentDue: 0 }],
        },
      }),
    });
    const edit = {
      ...base,
      id: 't1',
      type: 'DEBT_PAYMENT',
      amount: 100_000,
      interest: 5_000,
      account: ref('a1', 'Nequi'),
      debt: ref('d1', 'Libre inversión', false),
    } as unknown as TransactionDTO;
    renderWithProviders(<PayLoanForm edit={edit} onDone={() => undefined} />);
    expect(await screen.findByRole('note')).toHaveTextContent(
      'Este movimiento no se puede editar porque Libre inversión fue eliminado. Restáuralo para cambiarlo.',
    );
    expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('edits a disbursement with a PUT and locks it when its loan was deleted', async () => {
    const puts = mockPut({
      'GET /accounts': () => ({ status: 200, body: { items: [account('a1', 'Nequi')] } }),
    });
    const edit = {
      ...base,
      id: 't1',
      type: 'DEBT_DISBURSEMENT',
      amount: 900_000,
      account: ref('a1', 'Nequi'),
      debt: ref('d1', 'Libre inversión', false),
    } as unknown as TransactionDTO;
    renderWithProviders(<DisbursementForm debtId="d1" edit={edit} onDone={() => undefined} />);
    expect(await screen.findByLabelText('Valor')).toBeDisabled();
    expect(screen.getByLabelText('Recibido en')).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent(
      '"Libre inversión" fue eliminado: solo puedes cambiar la descripción. Restáuralo',
    );
    await userEvent.type(screen.getByLabelText('Descripción (opcional)'), 'Segundo giro');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      type: 'DEBT_DISBURSEMENT',
      amount: 900_000,
      accountId: 'a1',
      debtId: 'd1',
      date: '2026-10-05',
      description: 'Segundo giro',
      payee: null,
      notes: null,
      tags: [],
    });
  });

  it('shows the server message when a disbursement edit hits ENTITY_DELETED', async () => {
    mockPut({
      'GET /accounts': () => ({ status: 200, body: { items: [account('a1', 'Nequi')] } }),
      'PUT /transactions/t1': () => ({
        status: 409,
        body: { error: { code: 'ENTITY_DELETED', message: 'La cuenta fue eliminada' } },
      }),
    });
    const edit = {
      ...base,
      id: 't1',
      type: 'DEBT_DISBURSEMENT',
      amount: 900_000,
      account: ref('a1', 'Nequi'),
      debt: ref('d1', 'Libre inversión'),
    } as unknown as TransactionDTO;
    renderWithProviders(<DisbursementForm debtId="d1" edit={edit} onDone={() => undefined} />);
    await screen.findByLabelText('Valor');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La cuenta fue eliminada');
  });
});
