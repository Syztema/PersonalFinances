import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { ToastProvider } from './components/ui/Toast';

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

type Handler = (
  body: unknown,
) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;

/** Simula la API: claves "GET /auth/me", "POST /transactions", etc. (sin query string). */
export function mockApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = input.replace(/^\/api/, '').split('?')[0];
    const handler = routes[`${method} ${path}`];
    if (!handler)
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No mock' } }), {
        status: 404,
      });
    const { status, body } = await handler(init?.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const demoUser = {
  id: 'u1',
  name: 'Cristian',
  email: 'demo@example.com',
  theme: 'DARK',
  timezone: 'America/Bogota',
  createdAt: '2026-10-01T00:00:00.000Z',
};

/** Doble toque de ConfirmButton (exige 400 ms entre toques). Usar con vi.useFakeTimers({ shouldAdvanceTime: true }). */
export async function confirmTwice(name: string) {
  await userEvent.click(screen.getByRole('button', { name }));
  await vi.advanceTimersByTimeAsync(500);
  await userEvent.click(screen.getByRole('button', { name: '¿Seguro? Toca de nuevo' }));
}
