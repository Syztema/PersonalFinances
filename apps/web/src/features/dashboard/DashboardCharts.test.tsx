import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeReport } from '../../test/reportFixture';
import { renderWithProviders } from '../../test-utils';
import { DashboardCharts } from './DashboardCharts';

// Los gráficos reales se prueban en la Tarea 6; aquí solo importa cuándo se cargan.
vi.mock('../reports/charts/IncomeExpenseChart', async () => {
  const { createElement } = await import('react');
  return { IncomeExpenseChart: () => createElement('p', null, 'Gráfico de ingresos vs. gastos') };
});
vi.mock('../reports/charts/CategoryBarsChart', async () => {
  const { createElement } = await import('react');
  return { CategoryBarsChart: () => createElement('p', null, 'Gráfico de gastos por categoría') };
});
vi.mock('../reports/charts/SavingsChart', async () => {
  const { createElement } = await import('react');
  return { SavingsChart: () => createElement('p', null, 'Gráfico de evolución del ahorro') };
});

/** IntersectionObserver simulado: `enter()` hace que la sección entre en pantalla. */
class FakeObserver {
  static last: FakeObserver | null = null;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.last = this;
  }
  enter() {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function stubApi() {
  const fetchMock = vi.fn(async (_input: string) => new Response(JSON.stringify(makeReport())));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
/** Presets de las peticiones a GET /api/reports. */
const reportPresets = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url), 'http://localhost'))
    .filter((url) => url.pathname === '/api/reports')
    .map((url) => url.searchParams.get('preset'));

afterEach(() => {
  FakeObserver.last = null;
  vi.unstubAllGlobals();
});

describe('DashboardCharts (spec §5.2)', () => {
  it('does not ask for the report until the section is on screen', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const fetchMock = stubApi();
    renderWithProviders(<DashboardCharts />);
    expect(screen.getByRole('heading', { name: 'Tus últimos 6 meses' })).toBeInTheDocument();
    await waitFor(() => expect(FakeObserver.last?.observe).toHaveBeenCalled());
    expect(reportPresets(fetchMock)).toEqual([]);

    act(() => FakeObserver.last?.enter());
    expect(await screen.findByText('Gráfico de ingresos vs. gastos')).toBeInTheDocument();
    expect(screen.getByText('Gráfico de gastos por categoría')).toBeInTheDocument();
    expect(screen.getByText('Gráfico de evolución del ahorro')).toBeInTheDocument();
    expect(reportPresets(fetchMock)).toEqual(['LAST_6_MONTHS']);
    expect(FakeObserver.last?.disconnect).toHaveBeenCalled();
  });

  it('loads on mount when IntersectionObserver is not available', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const fetchMock = stubApi();
    renderWithProviders(<DashboardCharts />);
    expect(await screen.findByText('Gráfico de evolución del ahorro')).toBeInTheDocument();
    expect(reportPresets(fetchMock)).toEqual(['LAST_6_MONTHS']);
  });

  it('shows the error with Reintentar when the report fails', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: 'INTERNAL', message: 'No pudimos cargar el reporte.' },
            }),
            { status: 500 },
          ),
      ),
    );
    renderWithProviders(<DashboardCharts />);
    expect(await screen.findByText('No pudimos cargar el reporte.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
