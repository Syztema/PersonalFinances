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
  spendingPower: {
    daily: 0,
    spentToday: 0,
    remainingToday: 0,
    limitedBy: 'LIQUIDITY',
    reason: null,
    breakdown: {
      liquidity: { daily: 0, bindingDate: '2026-10-31', days: 12, items: [] },
      budget: null,
    },
  },
  status: { level: 'OK', title: 'Vas bien', message: '' },
  alerts: [],
  goals: [],
  budget: null,
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

  it('shows how much I can spend today and explains it', async () => {
    renderDashboard({
      ...base,
      money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 2_500_000)] },
      spendingPower: {
        daily: 45_400,
        spentToday: 20_000,
        remainingToday: 25_400,
        limitedBy: 'BUDGET',
        reason: null,
        breakdown: {
          liquidity: {
            daily: 60_000,
            bindingDate: '2026-10-24',
            days: 5,
            items: [
              { key: 'liquid', label: 'Dinero líquido', amount: 300_000 },
              { key: 'obligations', label: 'Obligaciones pendientes', amount: 0 },
            ],
          },
          budget: {
            daily: 45_400,
            days: 12,
            items: [{ key: 'budget', label: 'Presupuesto del mes', amount: 2_000_000 }],
          },
        },
      },
    });
    expect(await screen.findByText('¿Cuánto puedo gastar hoy?')).toBeInTheDocument();
    expect(screen.getByText('$45.400')).toBeInTheDocument();
    expect(screen.getByText('Te quedan hoy')).toBeInTheDocument();
    expect(screen.getByText('$25.400')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /¿Cómo se calcula\?/ }));
    expect(
      await screen.findByText('Hasta el 24 oct (5 días): $60.000 por día'),
    ).toBeInTheDocument();
    expect(screen.getByText('Presupuesto del mes')).toBeInTheDocument();
    expect(screen.queryByText('Obligaciones pendientes')).not.toBeInTheDocument();
    expect(screen.getByText(/Se usa el menor/)).toBeInTheDocument();
    expect(
      screen.getByText(/No incluye pagos de obligaciones programadas ni ajustes de saldo\./),
    ).toBeInTheDocument();
  });

  it('says when today was overspent or there is no margin', async () => {
    renderDashboard({
      ...base,
      money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 100_000)] },
      spendingPower: {
        ...base.spendingPower,
        daily: 0,
        spentToday: 5_000,
        remainingToday: -5_000,
        reason: 'Tu presupuesto del mes no deja margen para hoy.',
      },
    });
    expect(await screen.findByText('Hoy te pasaste')).toBeInTheDocument();
    expect(
      screen.getByText('Hoy no tienes margen. Tu presupuesto del mes no deja margen para hoy.'),
    ).toBeInTheDocument();
  });

  it('shows the status with the main alerts, the budget and the goals', async () => {
    renderDashboard({
      ...base,
      money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 2_500_000)] },
      status: {
        level: 'WARNING',
        title: 'Cuidado',
        message: 'Has utilizado el 78 % de tu presupuesto.',
      },
      alerts: [
        {
          key: 'budget:2026-10:total:75',
          level: 'WARNING',
          title: 'Llevas el 78 % del presupuesto',
          message: 'Has gastado $1.560.000 de $2.000.000.',
          href: '/budgets',
        },
      ],
      budget: { budget: 2_000_000, spent: 1_560_000, usage: 0.78, projectionExceedsOnDay: 26 },
      goals: [
        {
          id: 'g1',
          name: 'Comprar computador',
          targetAmount: 5_000_000,
          targetDate: '2027-06-30',
          account: {
            id: 'a2',
            name: 'Ahorro',
            icon: 'piggy-bank',
            color: '#0ea5e9',
            isActive: true,
            type: 'SAVINGS',
          },
          initialAmount: 1_000_000,
          status: 'ACTIVE',
          icon: 'laptop',
          color: '#0ea5e9',
          contributed: 400_000,
          withdrawn: 0,
          progress: 1_400_000,
          pct: 0.28,
          remaining: 3_600_000,
          monthlyNeeded: 450_000,
          weeklyNeeded: 94_737,
        },
      ],
    });
    expect(await screen.findByText('Cuidado')).toBeInTheDocument();
    expect(screen.getByText('Llevas el 78 % del presupuesto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todas las alertas' })).toHaveAttribute(
      'href',
      '/alerts',
    );
    expect(screen.getByRole('progressbar', { name: 'Uso del presupuesto' })).toHaveAttribute(
      'aria-valuenow',
      '78',
    );
    expect(
      screen.getByText('A este ritmo superarías el presupuesto el día 26.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Avance de Comprar computador' }),
    ).toBeInTheDocument();
  });
});

describe('SpendingPowerSheet without a budget (final review M2)', () => {
  it('does not say the lower limit is used when there is only one limit', async () => {
    renderDashboard({
      ...base,
      money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 2_500_000)] },
      spendingPower: {
        ...base.spendingPower,
        daily: 30_000,
        remainingToday: 30_000,
        limitedBy: 'LIQUIDITY',
        breakdown: {
          liquidity: { daily: 30_000, bindingDate: '2026-10-24', days: 5, items: [] },
          budget: null,
        },
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /¿Cómo se calcula\?/ }));
    expect(
      await screen.findByText('Hasta el 24 oct (5 días): $30.000 por día'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Se usa el menor/)).not.toBeInTheDocument();
    expect(screen.getByText(/Resultado:/)).toBeInTheDocument();
  });
});
