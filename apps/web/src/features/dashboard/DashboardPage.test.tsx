import type { DashboardDTO } from '@finanzas/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithProviders } from '../../test-utils';
import { QuickAddProvider, useQuickAdd } from '../quick-add/QuickAddContext';
import { DashboardPage } from './DashboardPage';

afterEach(() => vi.unstubAllGlobals());

const base: DashboardDTO = {
  greetingName: 'Cristian',
  today: '2026-10-20',
  month: '2026-10',
  money: { total: 2_500_000, liquid: 2_500_000, savings: 0, investment: 0, accounts: [] },
  available: {
    total: 1_600_000,
    breakdown: [
      { key: 'liquid', label: 'Dinero líquido (sin ahorro ni inversión)', amount: 2_500_000 },
      { key: 'cards', label: 'Tarjetas: deuda comprometida', amount: -900_000 },
    ],
  },
  debts: { cards: 900_000, loans: 0, total: 900_000 },
  netWorth: 1_700_000,
  thisMonth: {
    income: 4_000_000,
    expense: 2_100_000,
    savings: 800_000,
    investment: 0,
    remaining: 1_100_000,
    savingsRate: 0.2,
    savingsTargetPct: 20,
  },
  cards: [],
  loans: [],
};

const account = (
  id: string,
  name: string,
  type: 'BANK' | 'DIGITAL_WALLET' | 'CASH',
  balance: number,
) => ({
  id,
  name,
  type,
  institution: null,
  initialBalance: 0,
  openingDate: '2026-10-01',
  icon: 'wallet',
  color: '#123456',
  isActive: true,
  sortOrder: 0,
  balance,
});

const card = {
  id: 'c1',
  name: 'Nu Crédito',
  issuer: 'Nu',
  creditLimit: 5_000_000,
  initialDebt: 0,
  initialDebtInstallments: 1,
  openingDate: '2026-10-01',
  statementDay: 15,
  paymentDueDay: 30,
  icon: 'credit-card',
  color: '#820ad1',
  isActive: true,
  sortOrder: 0,
  debt: 1_800_000,
  available: 3_200_000,
  utilization: 0.36,
  amountDue: 450_000,
  dueDate: '2026-10-30',
  isOverdue: false,
  lastCutoff: '2026-10-15',
  nextCutoff: '2026-11-15',
  nextDueDate: '2026-11-30',
  committed: 900_000,
};

function RequestProbe() {
  const { request } = useQuickAdd();
  return (
    <output data-testid="request">
      {request ? `${request.kind}:${request.cardId ?? ''}` : 'none'}
    </output>
  );
}

function renderDashboard(data: DashboardDTO) {
  mockApi({ 'GET /dashboard': () => ({ status: 200, body: data }) });
  return renderWithProviders(
    <QuickAddProvider>
      <DashboardPage />
      <RequestProbe />
    </QuickAddProvider>,
  );
}

describe('DashboardPage', () => {
  it('shows totals, month balance, accounts and cards', async () => {
    renderDashboard({
      ...base,
      money: {
        ...base.money,
        accounts: [
          account('a1', 'Bancolombia', 'BANK', 1_500_000),
          account('a2', 'Nequi', 'DIGITAL_WALLET', 300_000),
          account('a3', 'Efectivo', 'CASH', 700_000),
        ],
      },
      cards: [card],
    });
    expect(await screen.findByRole('heading', { name: 'Hola, Cristian' })).toBeInTheDocument();
    expect(screen.getByText('Resumen de octubre')).toBeInTheDocument();
    expect(screen.getAllByText('$2.500.000').length).toBeGreaterThan(0);
    expect(screen.getByText('$1.600.000')).toBeInTheDocument();
    expect(screen.getByText('+$4.000.000')).toBeInTheDocument();
    expect(screen.getByText('-$2.100.000')).toBeInTheDocument();
    expect(screen.getByText('Bancolombia')).toBeInTheDocument();
    expect(screen.getByText('$3.200.000')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Pagar tarjeta Nu Crédito' }));
    expect(screen.getByTestId('request')).toHaveTextContent('card-payment:c1');
  });

  it('explains how the estimated available money is computed', async () => {
    renderDashboard({
      ...base,
      money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 2_500_000)] },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Disponible estimado/ }));
    expect(await screen.findByText('Tarjetas: deuda comprometida')).toBeInTheDocument();
    expect(screen.getByText('-$900.000')).toBeInTheDocument();
  });

  it('guides a brand-new user instead of showing empty numbers (review focus #5)', async () => {
    renderDashboard({ ...base, money: { ...base.money, total: 0, liquid: 0 } });
    expect(await screen.findByText('Crea tu primera cuenta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agregar cuenta' })).toHaveAttribute(
      'href',
      '/accounts',
    );
  });
  it('keeps the minus sign on a negative available amount', async () => {
    renderDashboard({
      ...base,
      money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 2_500_000)] },
      available: { ...base.available, total: -1_000_000 },
    });
    const el = await screen.findByText('-$1.000.000');
    expect(el).toHaveClass('text-negative');
  });
});
