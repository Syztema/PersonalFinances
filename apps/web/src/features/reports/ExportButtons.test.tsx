import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils';
import { ExportButtons } from './ExportButtons';

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
let downloads: string[] = [];

beforeEach(() => {
  downloads = [];
  URL.createObjectURL = vi.fn(() => 'blob:finanzas-1');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

const file = (name: string) =>
  new Response('contenido', {
    status: 200,
    headers: { 'content-disposition': `attachment; filename="${name}"` },
  });

function renderButtons(disabled = false) {
  const onPrint = vi.fn();
  renderWithProviders(
    <ExportButtons period={{ preset: 'THIS_MONTH' }} disabled={disabled} onPrint={onPrint} />,
  );
  return onPrint;
}

describe('ExportButtons (spec §5.1)', () => {
  it('asks for one file on a double tap and shows it is working', async () => {
    let release: () => void = () => undefined;
    const fetchMock = vi.fn(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return file('finanzas-movimientos-2026-10-01_2026-10-07.csv');
    });
    vi.stubGlobal('fetch', fetchMock);
    renderButtons();
    const csv = screen.getByRole('button', { name: 'Exportar CSV' });
    await userEvent.dblClick(csv);
    await waitFor(() => expect(csv).toBeDisabled());
    expect(csv).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(csv).toBeEnabled());
    expect(downloads).toEqual(['finanzas-movimientos-2026-10-01_2026-10-07.csv']);
  });

  it.each([
    [400, 'EXPORT_TOO_LARGE', 'Elige un periodo más corto'],
    [429, 'RATE_LIMITED', 'Demasiadas solicitudes. Intenta de nuevo en un momento.'],
  ])('shows the server message as an error toast on a %i', async (status, code, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code, message } }), { status })),
    );
    renderButtons();
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(await screen.findByText(message)).toHaveClass('bg-negative');
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeEnabled();
    expect(downloads).toEqual([]);
  });

  it('does nothing while the shown data is not the chosen period', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onPrint = renderButtons(true);
    for (const name of ['Exportar CSV', 'Exportar Excel', 'Imprimir o guardar PDF']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onPrint).not.toHaveBeenCalled();
  });

  it('prints with the print button', async () => {
    const onPrint = renderButtons();
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir o guardar PDF' }));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });
});
