import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeReport } from '../../test/reportFixture';
import { renderWithProviders } from '../../test-utils';
import { ReportsPage } from './ReportsPage';

// Los gráficos reales se prueban en la Tarea 6; aquí solo importa el `printMode` que reciben.
vi.mock('./charts/ReportCharts', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ printMode }: { printMode: boolean }) =>
      createElement('p', null, printMode ? 'Gráficos en modo impresión' : 'Gráficos en pantalla'),
  };
});

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
let exports: string[] = [];
let releaseLastMonth: () => void = () => undefined;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Septiembre completo ("Mes anterior"), con otros ingresos para distinguirlo. */
const lastMonth = makeReport({
  period: { preset: 'LAST_MONTH', from: '2026-09-01', to: '2026-09-30', months: ['2026-09'] },
  totals: { ...makeReport().totals, income: 3_500_000 },
});

/** API simulada: "Mes anterior" queda cargando hasta `releaseLastMonth()`. */
function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname === '/api/reports/export') {
        exports.push(url.search);
        return new Response('contenido', {
          status: 200,
          headers: {
            'content-disposition':
              'attachment; filename="finanzas-reporte-2026-09-01_2026-09-30.xlsx"',
          },
        });
      }
      if (url.pathname === '/api/reports') {
        if (url.searchParams.get('preset') !== 'LAST_MONTH') return json(makeReport());
        await new Promise<void>((resolve) => (releaseLastMonth = resolve));
        return json(lastMonth);
      }
      return json({ error: { code: 'NOT_FOUND', message: 'No mock' } }, 404);
    }),
  );
}

beforeEach(() => {
  exports = [];
  URL.createObjectURL = vi.fn(() => 'blob:finanzas-1');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  stubApi();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

describe('ReportsPage — exportar e imprimir', () => {
  it('never exports while another period loads and exports the period shown (review focus #1)', async () => {
    renderWithProviders(<ReportsPage />);
    const excel = () => screen.getByRole('button', { name: 'Exportar Excel' });
    await waitFor(() => expect(excel()).toBeEnabled());

    await userEvent.click(screen.getByRole('radio', { name: 'Mes anterior' }));
    await waitFor(() => expect(excel()).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Imprimir o guardar PDF' })).toBeDisabled();
    await userEvent.click(excel());
    expect(exports).toEqual([]);

    releaseLastMonth();
    expect(await screen.findByText('Del 01/09/2026 al 30/09/2026')).toBeInTheDocument();
    await waitFor(() => expect(excel()).toBeEnabled());
    await userEvent.click(excel());
    await waitFor(() => expect(exports).toEqual(['?format=xlsx&preset=LAST_MONTH']));
  });

  it('prints in print mode with the period header, also with Ctrl+P (spec §5.3)', async () => {
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('Gráficos en pantalla')).toBeInTheDocument();
    expect(screen.getByText('Finanzas — Reporte del 01/10/2026 al 20/10/2026')).toBeInTheDocument();

    const seen: string[] = [];
    vi.spyOn(window, 'print').mockImplementation(() => {
      seen.push(screen.queryByText('Gráficos en modo impresión') ? 'impresión' : 'pantalla');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir o guardar PDF' }));
    expect(seen).toEqual(['impresión']);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(screen.getByText('Gráficos en pantalla')).toBeInTheDocument();

    // Ctrl+P no pasa por el botón: el navegador dispara beforeprint y afterprint.
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect(screen.getByText('Gráficos en modo impresión')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(screen.getByText('Gráficos en pantalla')).toBeInTheDocument();
  });
});
