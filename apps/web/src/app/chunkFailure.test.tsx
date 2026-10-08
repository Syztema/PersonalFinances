import type { DashboardDTO } from '@finanzas/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { reloadPage } from '../lib/reload';
import { makeReport } from '../test/reportFixture';
import { demoUser, mockApi, renderWithProviders } from '../test-utils';
import { AppLayout } from './AppLayout';

// Final review 3B, Important 3: el chunk de los gráficos no llega (red caída, sin service worker
// todavía o un despliegue entre la entrada y el chunk).
vi.mock('../features/dashboard/RecentCharts', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
vi.mock('../features/reports/charts/ReportCharts', () => {
  throw new Error('Failed to fetch dynamically imported module');
});
vi.mock('../lib/reload', () => ({ reloadPage: vi.fn() }));

const dashboard: DashboardDTO = {
  greetingName: 'Cristian',
  today: '2026-10-20',
  month: '2026-10',
  money: {
    total: 2_500_000,
    liquid: 2_500_000,
    savings: 0,
    investment: 0,
    accounts: [
      {
        id: 'a1',
        name: 'Bancolombia',
        type: 'BANK',
        institution: null,
        initialBalance: 0,
        openingDate: '2026-10-01',
        icon: 'wallet',
        color: '#123456',
        isActive: true,
        sortOrder: 0,
        balance: 2_500_000,
      },
    ],
  },
  available: { total: 1_600_000, breakdown: [] },
  debts: { cards: 0, loans: 0, total: 0 },
  netWorth: 2_500_000,
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

function renderInLayout(path: string) {
  mockApi({
    'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
    'GET /dashboard': () => ({ status: 200, body: dashboard }),
    'GET /reports': () => ({ status: 200, body: makeReport() }),
  });
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Route>
    </Routes>,
    { route: path },
  );
}

beforeEach(() => {
  vi.mocked(reloadPage).mockClear();
  // React informa en consola el error que atrapa la frontera; aquí es el error esperado.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a chart chunk that fails to load (final review 3B, Important 3)', () => {
  it('keeps the dashboard and the navigation, with a local message under "Tus últimos 6 meses"', async () => {
    renderInLayout('/');
    const section = (await screen.findByRole('heading', { name: 'Tus últimos 6 meses' })).closest(
      'section',
    )!;
    expect(
      await within(section).findByText('No se pudieron cargar los gráficos.'),
    ).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hola, Cristian' })).toBeInTheDocument();
    expect(screen.getByText('Bancolombia')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('keeps the totals, the export buttons and the navigation on Reportes', async () => {
    renderInLayout('/reports');
    expect(await screen.findByText('No se pudieron cargar los gráficos.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reportes' })).toBeInTheDocument();
    expect(screen.getByText('+$4.000.000')).toBeInTheDocument();
    expect(screen.getByText('$1.250.000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('reloads the page from "Recargar" (a rejected lazy import is memoized)', async () => {
    renderInLayout('/reports');
    await userEvent.click(await screen.findByRole('button', { name: 'Recargar' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });
});
