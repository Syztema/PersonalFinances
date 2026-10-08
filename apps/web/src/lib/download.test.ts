import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, onUnauthorized } from './api';
import { downloadReport, exportQuery, REVOKE_DELAY_MS } from './download';

const NAME = 'finanzas-movimientos-2026-10-01_2026-10-07.csv';
const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
let clicks: Array<{ href: string; download: string }> = [];

function stubFetch(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async () => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const fileResponse = (headers: Record<string, string>) =>
  new Response('Fecha;Tipo\r\n2026-10-05;Gasto\r\n', { status: 200, headers });
const errorResponse = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), { status });

beforeEach(() => {
  clicks = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  URL.createObjectURL = vi.fn(() => 'blob:finanzas-1');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.href, download: this.download });
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

describe('downloadReport', () => {
  it('downloads the file with the server name, without navigating, and frees the URL', async () => {
    const before = window.location.href;
    const fetchMock = stubFetch(() =>
      fileResponse({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${NAME}"`,
      }),
    );
    await downloadReport('csv', { preset: 'THIS_MONTH' });
    expect(fetchMock).toHaveBeenCalledWith('/api/reports/export?format=csv&preset=THIS_MONTH', {
      credentials: 'same-origin',
    });
    expect(clicks).toEqual([{ href: 'blob:finanzas-1', download: NAME }]);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    expect(blob.size).toBeGreaterThan(0);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(window.location.href).toBe(before);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:finanzas-1');
  });

  it('uses a default name when the header is missing', async () => {
    stubFetch(() => fileResponse({}));
    await downloadReport('xlsx', { preset: 'LAST_MONTH' });
    expect(clicks).toEqual([{ href: 'blob:finanzas-1', download: 'finanzas-reporte.xlsx' }]);
  });

  it.each([
    [400, 'EXPORT_TOO_LARGE', 'Elige un periodo más corto'],
    [429, 'RATE_LIMITED', 'Demasiadas solicitudes. Intenta de nuevo en un momento.'],
  ])('turns a %i into an ApiError with the server message', async (status, code, message) => {
    stubFetch(() => errorResponse(status, code, message));
    const err = await downloadReport('csv', { preset: 'THIS_MONTH' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status, code, message });
    expect(clicks).toEqual([]);
  });

  it('reports a network failure in Spanish', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const err = (await downloadReport('csv', { preset: 'THIS_MONTH' }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err.code).toBe('NETWORK');
    expect(err.message).toBe('Sin conexión. Revisa tu internet e intenta de nuevo.');
  });

  it('notifies an expired session like any other request', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    stubFetch(() => errorResponse(401, 'SESSION_EXPIRED', 'Tu sesión expiró.'));
    await downloadReport('csv', { preset: 'THIS_MONTH' }).catch(() => undefined);
    expect(listener).toHaveBeenCalledWith('SESSION_EXPIRED');
    off();
  });
});

describe('exportQuery', () => {
  it('sends a preset or the custom dates, never both', () => {
    expect(exportQuery('csv', { preset: 'LAST_3_MONTHS' })).toBe('format=csv&preset=LAST_3_MONTHS');
    expect(exportQuery('xlsx', { from: '2026-01-15', to: '2026-03-10' })).toBe(
      'format=xlsx&from=2026-01-15&to=2026-03-10',
    );
  });
});
