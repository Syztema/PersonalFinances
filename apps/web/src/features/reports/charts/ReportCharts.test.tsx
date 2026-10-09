import type { ReportDTO } from '@finanzas/shared';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountRef, categoryRef, makeEmptyReport, makeReport } from '../../../test/reportFixture';
import {
  axisMoney,
  formatShare,
  isAnimated,
  monthTickFormatter,
  OTHER_COLOR,
  seriesColor,
  tooltipMoney,
} from './chartTheme';
import { EMPTY_WHO, seriesFill, UNSET_COLOR } from './companionSeries';
import ReportCharts from './ReportCharts';

afterEach(() => vi.unstubAllGlobals());

const card = (title: string) => screen.getByRole('region', { name: title });

/** Filas de la tabla de un gráfico, sin el encabezado. */
const rowsOf = (title: string) =>
  within(within(card(title)).getByRole('table', { name: title }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));

async function openTable(title: string) {
  await userEvent.click(within(card(title)).getByRole('button', { name: 'Ver tabla' }));
  return rowsOf(title);
}

/** Recharts termina de dibujar en un efecto. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));

describe('ReportCharts', () => {
  it('shows the same data of every chart in its "Ver tabla" table (spec §5.1)', async () => {
    render(<ReportCharts report={makeReport()} printMode={false} />);
    const expected: Record<string, string[][]> = {
      'Ingresos vs. gastos': [['octubre de 2026', '$4.000.000', '$2.150.000']],
      'Gastos por categoría': [
        ['Arriendo', '$1.000.000', '46,5 %'],
        ['Mercado', '$820.000', '38,1 %'],
        ['Transporte', '$180.000', '8,4 %'],
        ['Restaurantes', '$150.000', '7,0 %'],
      ],
      'Gastos por compañía': [
        ['Amigos', '$900.000', '41,9 %'],
        ['Pareja', '$500.000', '23,3 %'],
        ['Familia (eliminada)', '$250.000', '11,6 %'],
        ['Sin indicar', '$500.000', '23,3 %'],
      ],
      'Con quién gastas, mes a mes': [
        ['octubre de 2026', '$900.000', '$500.000', '$250.000', '$500.000'],
      ],
      'Gastos por método de pago': [
        ['Cuenta bancaria', '$1.800.000', '83,7 %'],
        ['Tarjeta crédito', '$350.000', '16,3 %'],
      ],
      'Dónde está tu dinero': [
        ['Bancolombia', '$1.000.000', '$4.000.000', '$2.600.000', '$2.400.000'],
        ['Ahorro', '$1.000.000', '$600.000', '$0', '$1.600.000'],
      ],
      'Deuda de tarjetas': [['Nu', '$350.000', '$200.000', '$900.000']],
      'Evolución del ahorro': [['octubre de 2026', '$1.600.000']],
      'Evolución mensual': [['octubre de 2026', '$4.000.000', '$900.000', '$3.100.000']],
      'Presupuesto vs. gasto': [['octubre de 2026', '$2.500.000', '$2.150.000']],
    };
    for (const [title, rows] of Object.entries(expected)) {
      expect(await openTable(title)).toEqual(rows);
    }
    const toggle = within(card('Gastos por categoría')).getByRole('button', {
      name: 'Ocultar tabla',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(within(card('Gastos por categoría')).queryByRole('table')).not.toBeInTheDocument();
  });

  it('groups the categories after the sixth in "Otros" and marks deleted ones', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({
      category: { ...categoryRef(`c${i}`, `Categoría ${i + 1}`), isActive: i !== 1 },
      amount: (9 - i) * 100_000,
      share: Number(((9 - i) / 45).toFixed(4)),
    }));
    render(<ReportCharts report={makeReport({ expenseByCategory: nine })} printMode={false} />);
    const rows = await openTable('Gastos por categoría');
    expect(rows).toHaveLength(7);
    expect(rows[1]).toEqual(['Categoría 2 (eliminada)', '$800.000', '17,8 %']);
    expect(rows[6]).toEqual(['Otros', '$600.000', '13,3 %']);
  });

  it('shows an overdraft as negative and marks deleted accounts', async () => {
    const report = makeReport({
      accounts: [
        {
          account: accountRef('a-bank', 'Bancolombia'),
          opening: 200_000,
          inflow: 0,
          outflow: 500_000,
          closing: -300_000,
        },
        {
          account: { ...accountRef('a-nequi', 'Nequi', 'DIGITAL_WALLET'), isActive: false },
          opening: 50_000,
          inflow: 0,
          outflow: 50_000,
          closing: 0,
        },
      ],
    });
    render(<ReportCharts report={report} printMode={false} />);
    expect(await openTable('Dónde está tu dinero')).toEqual([
      ['Bancolombia', '$200.000', '$0', '$500.000', '-$300.000'],
      ['Nequi (eliminada)', '$50.000', '$0', '$50.000', '$0'],
    ]);
  });

  it('shows only the spending of a month without a budget', async () => {
    const report = makeReport({
      budget: {
        months: [
          { month: '2026-09', budget: null, spent: 1_900_000 },
          { month: '2026-10', budget: 2_500_000, spent: 2_150_000 },
        ],
        lines: [],
      },
    });
    render(<ReportCharts report={report} printMode={false} />);
    expect(await openTable('Presupuesto vs. gasto')).toEqual([
      ['septiembre de 2026', 'Sin presupuesto', '$1.900.000'],
      ['octubre de 2026', '$2.500.000', '$2.150.000'],
    ]);
  });

  it('names one column per series in the monthly table, "Sin indicar" last', async () => {
    render(<ReportCharts report={makeReport()} printMode={false} />);
    const title = 'Con quién gastas, mes a mes';
    await openTable(title);
    const headers = within(within(card(title)).getByRole('table', { name: title }))
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Mes', 'Amigos', 'Pareja', 'Familia (eliminada)', 'Sin indicar']);
  });

  it('keeps the "Gastos por compañía" table open when printing', () => {
    render(<ReportCharts report={makeReport()} printMode />);
    expect(rowsOf('Gastos por compañía')).toHaveLength(4);
  });

  it('colors options by rank, "Otros" and "Sin indicar" apart', () => {
    const ref = { id: 'x', name: 'X', icon: 'users', color: '#000000', isActive: true };
    expect(seriesFill({ key: 'x', companion: ref, amount: 1, share: 1 }, 0)).toBe(seriesColor(0));
    expect(seriesFill({ key: 'x', companion: ref, amount: 1, share: 1 }, 2)).toBe(seriesColor(2));
    expect(seriesFill({ key: 'other', companion: null, amount: 1, share: 1 }, 5)).toBe(OTHER_COLOR);
    expect(seriesFill({ key: 'none', companion: null, amount: 1, share: 1 }, 6)).toBe(UNSET_COLOR);
    expect(UNSET_COLOR).not.toBe(OTHER_COLOR);
  });
});

describe('ReportCharts edge cases (review focus #5)', () => {
  it('shows an empty state per chart when there is nothing to draw', () => {
    const empty: ReportDTO = makeEmptyReport({
      accounts: [],
      months: [
        {
          month: '2026-10',
          income: 0,
          expense: 0,
          savings: 0,
          investment: 0,
          remaining: 0,
          closing: { totalMoney: 0, debts: 0, netWorth: 0, savingsBalance: 0 },
        },
      ],
    });
    render(<ReportCharts report={empty} printMode={false} />);
    const messages: Record<string, string> = {
      'Ingresos vs. gastos': 'Sin ingresos ni gastos en este periodo.',
      'Gastos por categoría': 'Sin gastos en este periodo.',
      'Gastos por compañía': EMPTY_WHO,
      'Con quién gastas, mes a mes': EMPTY_WHO,
      'Gastos por método de pago': 'Sin gastos en este periodo.',
      'Dónde está tu dinero': 'Sin cuentas con saldo en este periodo.',
      'Deuda de tarjetas': 'Sin tarjetas con deuda ni movimientos en este periodo.',
      'Evolución del ahorro': 'Aún no tienes dinero en cuentas de ahorro o inversión.',
      'Evolución mensual': 'Sin saldos ni deudas en este periodo.',
      'Presupuesto vs. gasto': 'Sin presupuesto ni gastos en este periodo.',
    };
    for (const [title, message] of Object.entries(messages)) {
      expect(within(card(title)).getByText(message)).toBeVisible();
      expect(
        within(card(title)).queryByRole('button', { name: 'Ver tabla' }),
      ).not.toBeInTheDocument();
    }
  });

  it('shows the empty state when every expense is Sin indicar', () => {
    const report = makeReport({
      expenseByCompanion: [{ companion: null, amount: 2_150_000, share: 1 }],
      companionMonths: [{ month: '2026-10', items: [{ companionId: null, amount: 2_150_000 }] }],
    });
    render(<ReportCharts report={report} printMode={false} />);
    for (const title of ['Gastos por compañía', 'Con quién gastas, mes a mes']) {
      expect(within(card(title)).getByText(EMPTY_WHO)).toBeVisible();
      expect(
        within(card(title)).queryByRole('button', { name: 'Ver tabla' }),
      ).not.toBeInTheDocument();
    }
  });

  it('draws one month, zeros, an overdraft and negative net worth without NaN', async () => {
    const report = makeReport({
      totals: {
        income: 0,
        expense: 300_000,
        savings: 0,
        investment: 0,
        remaining: -300_000,
        savingsRate: null,
      },
      accounts: [
        {
          account: accountRef('a-bank', 'Bancolombia'),
          opening: 0,
          inflow: 0,
          outflow: 300_000,
          closing: -300_000,
        },
      ],
      cards: [
        {
          card: { id: 'k-nu', name: 'Nu', icon: 'credit-card', color: '#820ad1', isActive: true },
          purchases: 0,
          payments: 100_000,
          closingDebt: -100_000,
        },
      ],
      months: [
        {
          month: '2026-10',
          income: 0,
          expense: 300_000,
          savings: 0,
          investment: 0,
          remaining: -300_000,
          closing: {
            totalMoney: -300_000,
            debts: 1_200_000,
            netWorth: -1_500_000,
            savingsBalance: 0,
          },
        },
      ],
      budget: { months: [{ month: '2026-10', budget: null, spent: 300_000 }], lines: [] },
    });
    const { container } = render(<ReportCharts report={report} printMode />);
    await settle();
    const svgs = container.querySelectorAll('.recharts-wrapper > svg');
    expect(svgs).toHaveLength(9);
    // El dominio incluye el sobregiro: el eje de las barras muestra ticks negativos.
    const ticks = [...card('Dónde está tu dinero').querySelectorAll('text')];
    expect(ticks.some((t) => t.textContent?.startsWith('-'))).toBe(true);
    expect(container.innerHTML).not.toContain('NaN');
    expect(within(card('Evolución del ahorro')).getByText(/Aún no tienes dinero/)).toBeVisible();
  });
});

describe('ReportCharts negative line values', () => {
  const month = (key: string, closing: ReportDTO['months'][number]['closing']) => ({
    month: key,
    income: 0,
    expense: 0,
    savings: 0,
    investment: 0,
    remaining: 0,
    closing,
  });
  const negativeTicks = (title: string) =>
    [...card(title).querySelectorAll('text')].filter((t) => t.textContent?.startsWith('-'));

  it('keeps a negative net worth and a negative savings balance inside the axes', async () => {
    const report = makeReport({
      months: [
        month('2026-09', {
          totalMoney: 500_000,
          debts: 900_000,
          netWorth: -400_000,
          savingsBalance: -200_000,
        }),
        month('2026-10', {
          totalMoney: 300_000,
          debts: 1_200_000,
          netWorth: -900_000,
          savingsBalance: 100_000,
        }),
      ],
    });
    render(<ReportCharts report={report} printMode />);
    await settle();
    expect(negativeTicks('Evolución mensual').length).toBeGreaterThan(0);
    expect(negativeTicks('Evolución del ahorro').length).toBeGreaterThan(0);
  });
});

describe('ReportCharts when printing (spec §5.3)', () => {
  it('draws at a fixed 680 px and keeps the category and account tables open', async () => {
    const { container } = render(<ReportCharts report={makeReport()} printMode />);
    await settle();
    const svgs = [...container.querySelectorAll('.recharts-wrapper > svg')];
    expect(svgs).toHaveLength(10);
    for (const svg of svgs) expect(svg).toHaveAttribute('width', '680');
    for (const title of ['Gastos por categoría', 'Dónde está tu dinero']) {
      expect(within(card(title)).getByRole('table', { name: title })).toBeVisible();
      expect(
        within(card(title)).queryByRole('button', { name: 'Ver tabla' }),
      ).not.toBeInTheDocument();
    }
    expect(within(card('Ingresos vs. gastos')).queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('chartTheme', () => {
  it('formats axes compact and tooltips exact', () => {
    expect(axisMoney(1_200_000)).toBe('$1,2 M');
    expect(axisMoney(850_000)).toBe('$850 mil');
    expect(tooltipMoney(1_234_567)).toBe('$1.234.567');
    expect(formatShare(0.0698)).toBe('7,0 %');
  });

  it('uses the chart tokens', () => {
    expect(seriesColor(0)).toBe('var(--chart-1)');
    expect(seriesColor(5)).toBe('var(--chart-6)');
  });

  it('names months, with the year only when the period crosses years', () => {
    expect(monthTickFormatter(['2026-09', '2026-10'])('2026-10')).toBe('oct');
    expect(monthTickFormatter(['2025-12', '2026-01'])('2025-12')).toBe('dic 25');
  });

  it('turns animation off when printing or with prefers-reduced-motion', () => {
    expect(isAnimated(false)).toBe(true);
    expect(isAnimated(true)).toBe(false);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    expect(isAnimated(false)).toBe(false);
  });
});
