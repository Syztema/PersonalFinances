import { resolveReportPeriod } from '@finanzas/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEmptyReport, makeReport } from '../../test/reportFixture';
import { demoUser, renderWithProviders, setOnline } from '../../test-utils';
import { qk } from '../../lib/queries';
import { hasMovements, ReportsPage } from './ReportsPage';

// Los gráficos reales (Recharts) se prueban en charts/ReportCharts.test.tsx; aquí solo la ranura.
vi.mock('./charts/ReportCharts', () => ({ default: () => <div data-testid="report-charts" /> }));

const TODAY = '2026-10-20';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Simula GET /api/reports y anota la query string de cada petición. */
function stubReports(respond: (params: URLSearchParams) => Response | Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname !== '/api/reports') {
        return json({ error: { code: 'NOT_FOUND', message: 'No mock' } }, 404);
      }
      calls.push(url.searchParams.toString());
      return respond(url.searchParams);
    }),
  );
  return calls;
}

beforeEach(() => {
  // Solo Date: hoy es el 20 de octubre de 2026 a las 10 a. m. en Bogotá.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T15:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ReportsPage', () => {
  it('loads this month and shows the totals of the period', async () => {
    const calls = stubReports(() => json(makeReport()));
    renderWithProviders(<ReportsPage />);
    expect(screen.getByRole('heading', { name: 'Reportes' })).toBeInTheDocument();
    expect(await screen.findByText('+$4.000.000')).toBeInTheDocument();
    expect(screen.getByText('Del 01/10/2026 al 20/10/2026')).toBeInTheDocument();
    expect(screen.getByText('-$2.150.000')).toBeInTheDocument();
    expect(screen.getByText('$600.000')).toBeInTheDocument();
    expect(screen.getByText('$1.250.000')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Este mes' })).toHaveAttribute('aria-checked', 'true');
    expect(calls).toEqual(['preset=THIS_MONTH']);
    expect(await screen.findByTestId('report-charts')).toBeInTheDocument();
  });

  it('asks the API for the chosen preset', async () => {
    const calls = stubReports(() => json(makeReport()));
    renderWithProviders(<ReportsPage />);
    await screen.findByText('+$4.000.000');
    await userEvent.click(screen.getByRole('radio', { name: 'Mes anterior' }));
    await userEvent.click(screen.getByRole('radio', { name: '1 año' }));
    await waitFor(() =>
      expect(calls).toEqual(['preset=THIS_MONTH', 'preset=LAST_MONTH', 'preset=LAST_12_MONTHS']),
    );
  });

  it('applies a custom period from the panel', async () => {
    const calls = stubReports((params) =>
      json(
        params.has('from')
          ? makeReport({
              period: {
                preset: null,
                from: '2026-08-15',
                to: '2026-09-10',
                months: ['2026-08', '2026-09'],
              },
            })
          : makeReport(),
      ),
    );
    renderWithProviders(<ReportsPage />);
    await screen.findByText('+$4.000.000');
    await userEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Periodo personalizado' });
    expect(within(dialog).getByLabelText('Desde')).toHaveValue('2026-10-01');
    expect(within(dialog).getByLabelText('Hasta')).toHaveValue(TODAY);
    fireEvent.change(within(dialog).getByLabelText('Desde'), { target: { value: '2026-08-15' } });
    fireEvent.change(within(dialog).getByLabelText('Hasta'), { target: { value: '2026-09-10' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ver reporte' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Del 15/08/2026 al 10/09/2026')).toBeInTheDocument();
    expect(calls).toEqual(['preset=THIS_MONTH', 'from=2026-08-15&to=2026-09-10']);
    expect(screen.getByRole('radio', { name: 'Este mes' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // Spec §7.1: el periodo personalizado elegido va relleno (contraste AA sobre el fondo de la página).
    expect(screen.getByRole('button', { name: 'Personalizado' })).toHaveClass(
      'bg-primary',
      'text-primary-fg',
    );
  });

  it('validates the custom period like the API and sends nothing while it is wrong', async () => {
    const calls = stubReports(() => json(makeReport()));
    renderWithProviders(<ReportsPage />);
    await screen.findByText('+$4.000.000');
    await userEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Periodo personalizado' });
    const from = within(dialog).getByLabelText('Desde');
    const to = within(dialog).getByLabelText('Hasta');
    const submit = within(dialog).getByRole('button', { name: 'Ver reporte' });

    // La fecha inicial después de la final (mismo mensaje que devuelve la API).
    const reversed = resolveReportPeriod({ from: '2026-09-10', to: '2026-08-15' }, TODAY);
    if (reversed.ok) throw new Error('el periodo invertido debería fallar');
    fireEvent.change(from, { target: { value: '2026-09-10' } });
    fireEvent.change(to, { target: { value: '2026-08-15' } });
    await userEvent.click(submit);
    expect(from).toHaveAttribute('aria-invalid', 'true');
    expect(from).toHaveAccessibleDescription(String(reversed.fields.from));

    // Una fecha final futura.
    fireEvent.change(from, { target: { value: '2026-10-01' } });
    fireEvent.change(to, { target: { value: '2026-10-25' } });
    await userEvent.click(submit);
    expect(to).toHaveAccessibleDescription('La fecha final no puede ser futura');

    // Más de 24 meses calendario.
    fireEvent.change(from, { target: { value: '2024-09-01' } });
    fireEvent.change(to, { target: { value: TODAY } });
    await userEvent.click(submit);
    expect(from).toHaveAccessibleDescription('Elige un periodo de máximo 24 meses');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(calls).toEqual(['preset=THIS_MONTH']);
  });

  it('says when the period has no movements', async () => {
    stubReports(() => json(makeEmptyReport()));
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('Sin movimientos en este periodo')).toBeInTheDocument();
    expect(screen.queryByText('Ingresos')).not.toBeInTheDocument();
  });

  it('shows the error with "Reintentar" and recovers', async () => {
    let fail = true;
    stubReports(() =>
      fail
        ? json({ error: { code: 'INTERNAL', message: 'No pudimos armar el reporte' } }, 500)
        : json(makeReport()),
    );
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('No pudimos armar el reporte')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('+$4.000.000')).toBeInTheDocument();
  });

  it('says "Sin conexión" while the report waits for the network', async () => {
    const calls = stubReports(() => json(makeReport()));
    setOnline(false);
    renderWithProviders(<ReportsPage />);
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
    expect(calls).toEqual([]);
    setOnline(true);
    expect(await screen.findByText('+$4.000.000')).toBeInTheDocument();
  });

  it('never shows the numbers of another period under the new choice (review focus #1)', async () => {
    const pending = new Map<string, (response: Response) => void>();
    const calls = stubReports((params) => {
      const preset = params.get('preset') ?? '';
      if (preset === 'THIS_MONTH') return json(makeReport());
      return new Promise((resolve) => pending.set(preset, resolve));
    });
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('+$4.000.000')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Mes anterior' }));
    await userEvent.click(screen.getByRole('radio', { name: '3 meses' }));
    expect(screen.getByRole('status', { name: 'Cargando reporte' })).toBeInTheDocument();
    expect(screen.queryByText('+$4.000.000')).not.toBeInTheDocument();
    await waitFor(() => expect(pending.size).toBe(2));

    // Llega primero la respuesta de "3 meses" y después, tarde, la de "Mes anterior".
    const threeMonths = makeReport({
      period: {
        preset: 'LAST_3_MONTHS',
        from: '2026-08-01',
        to: TODAY,
        months: ['2026-08', '2026-09', '2026-10'],
      },
      totals: { ...makeReport().totals, income: 9_000_000 },
    });
    await act(async () => pending.get('LAST_3_MONTHS')?.(json(threeMonths)));
    expect(await screen.findByText('+$9.000.000')).toBeInTheDocument();
    const lastMonth = makeReport({ totals: { ...makeReport().totals, income: 5_500_000 } });
    await act(async () => pending.get('LAST_MONTH')?.(json(lastMonth)));
    expect(screen.getByText('+$9.000.000')).toBeInTheDocument();
    expect(screen.queryByText('+$5.500.000')).not.toBeInTheDocument();
    expect(screen.getByText('Del 01/08/2026 al 20/10/2026')).toBeInTheDocument();
    expect(calls).toEqual(['preset=THIS_MONTH', 'preset=LAST_MONTH', 'preset=LAST_3_MONTHS']);
  });

  it('uses the date of the user timezone as today in the custom period', async () => {
    // 15:00 UTC: en Bogotá es 20/10 y en Kiritimati (UTC+14) ya es 21/10.
    const calls = stubReports(() => json(makeReport()));
    const { queryClient } = renderWithProviders(<ReportsPage />);
    // La sesión ya está cargada (como en la app, donde el guardián de rutas la pide antes).
    queryClient.setQueryData(qk.me, { ...demoUser, timezone: 'Pacific/Kiritimati' });
    await screen.findByText('+$4.000.000');
    await userEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Periodo personalizado' });
    await waitFor(() => expect(within(dialog).getByLabelText('Hasta')).toHaveValue('2026-10-21'));
    expect(within(dialog).getByLabelText('Hasta')).toHaveAttribute('max', '2026-10-21');
    fireEvent.change(within(dialog).getByLabelText('Desde'), { target: { value: '2026-10-05' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ver reporte' }));
    await waitFor(() => expect(calls).toContain('from=2026-10-05&to=2026-10-21'));
  });

  it('clears the error of a date as soon as it is edited', async () => {
    stubReports(() => json(makeReport()));
    renderWithProviders(<ReportsPage />);
    await screen.findByText('+$4.000.000');
    await userEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Periodo personalizado' });
    const from = within(dialog).getByLabelText('Desde');
    const to = within(dialog).getByLabelText('Hasta');
    fireEvent.change(to, { target: { value: '2026-10-25' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ver reporte' }));
    expect(to).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(from, { target: { value: '2026-10-02' } });
    expect(to).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(to, { target: { value: TODAY } });
    expect(to).not.toHaveAttribute('aria-invalid', 'true');
    expect(to).not.toHaveAccessibleDescription('La fecha final no puede ser futura');
  });
});

describe('hasMovements', () => {
  it('is false when everything is zero (only balances from before)', () => {
    expect(hasMovements(makeEmptyReport())).toBe(false);
  });

  it('is true with only account movements (e.g. transfers between own accounts)', () => {
    const [account] = makeEmptyReport().accounts;
    if (!account) throw new Error('fixture sin cuentas');
    const report = makeEmptyReport({
      accounts: [{ ...account, inflow: 100_000, closing: account.closing + 100_000 }],
    });
    expect(hasMovements(report)).toBe(true);
  });

  it('is true with only card movements', () => {
    const [card] = makeReport().cards;
    if (!card) throw new Error('fixture sin tarjetas');
    const report = makeEmptyReport({ cards: [{ ...card, purchases: 0, payments: 50_000 }] });
    expect(hasMovements(report)).toBe(true);
  });
});
