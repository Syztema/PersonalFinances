import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { SettingsPage } from './SettingsPage';

afterEach(() => vi.unstubAllGlobals());

const response = {
  settings: {
    obligationsPct: 50,
    savingsPct: 20,
    investmentPct: 10,
    leisurePct: 10,
    otherPct: 10,
    monthlyIncomeEstimate: null,
    lowBalanceThreshold: 100_000,
  },
  month: {
    key: '2026-10',
    projectedIncome: 4_000_000,
    buckets: [
      { key: 'OBLIGATIONS', label: 'Obligaciones', pct: 50, target: 2_000_000, actual: 1_500_000 },
      { key: 'SAVINGS', label: 'Ahorro', pct: 20, target: 800_000, actual: 400_000 },
      { key: 'INVESTMENT', label: 'Inversión', pct: 10, target: 400_000, actual: 0 },
      { key: 'LEISURE', label: 'Entretenimiento', pct: 10, target: 400_000, actual: 380_000 },
      { key: 'OTHER', label: 'Otros', pct: 10, target: 400_000, actual: 100_000 },
    ],
  },
};

describe('SettingsPage', () => {
  it('only saves percentages that add up to 100', async () => {
    const puts: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /settings/financial': () => ({ status: 200, body: response }),
      'PUT /settings/financial': (body) => {
        puts.push(body);
        return { status: 200, body: response };
      },
    });
    renderWithProviders(<SettingsPage />);
    const savings = await screen.findByLabelText('Ahorro (%)');
    await userEvent.clear(savings);
    await userEvent.type(savings, '25');
    expect(screen.getByText(/Total: 105 %/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeDisabled();

    const other = screen.getByLabelText('Otros (%)');
    await userEvent.clear(other);
    await userEvent.type(other, '5');
    expect(screen.getByText('Total: 100 %')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    await waitFor(() =>
      expect(puts).toEqual([
        {
          obligationsPct: 50,
          savingsPct: 25,
          investmentPct: 10,
          leisurePct: 10,
          otherPct: 5,
          monthlyIncomeEstimate: null,
          lowBalanceThreshold: 100_000,
        },
      ]),
    );
    expect(screen.getByRole('progressbar', { name: 'Entretenimiento' })).toHaveAttribute(
      'aria-valuenow',
      '95',
    );
  });
});
