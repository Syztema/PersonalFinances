import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onUnauthorized } from './api';

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn(
    async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('sends JSON to /api with same-origin credentials', async () => {
    const fetchMock = mockFetch(201, { ok: true });
    await api.post('/accounts', { name: 'Nequi' });
    expect(fetchMock).toHaveBeenCalledWith('/api/accounts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"Nequi"}',
    });
  });

  it('turns error bodies into ApiError with fields', async () => {
    mockFetch(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Revisa los datos ingresados.',
        fields: { amount: 'Requerido' },
      },
    });
    const err = (await api.post('/transactions', {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { amount: 'Requerido' },
    });
  });

  it('notifies 401s except for login, me and logout (review focus #2)', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    mockFetch(401, { error: { code: 'SESSION_EXPIRED', message: 'Tu sesión expiró.' } });
    await api.get('/dashboard').catch(() => undefined);
    await api.get('/auth/me').catch(() => undefined);
    await api.post('/auth/login', {}).catch(() => undefined);
    await api.post('/auth/logout').catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('SESSION_EXPIRED');
    off();
  });

  it('reports network failures in Spanish and handles 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const err = (await api.get('/dashboard').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('NETWORK');
    mockFetch(204);
    await expect(api.del('/accounts/x')).resolves.toBeUndefined();
  });
});
