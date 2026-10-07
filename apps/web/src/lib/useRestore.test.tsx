import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { mockApi } from '../test-utils';
import { useRestore } from './useRestore';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useRestore((id) => `/things/${id}/restore`, 'Cosa restaurada'), {
    wrapper,
  });
  return { hook, invalidate };
}

describe('useRestore', () => {
  it('invalidates and toasts the message on success', async () => {
    mockApi({ 'POST /things/t1/restore': () => ({ status: 200, body: {} }) });
    const { hook, invalidate } = setup();
    act(() => hook.result.current.restore('t1'));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(await screen.findByText('Cosa restaurada')).toBeInTheDocument();
  });

  it('toasts the error message on failure', async () => {
    mockApi({
      'POST /things/t1/restore': () => ({
        status: 409,
        body: { error: { code: 'PARENT_DELETED', message: 'La principal está eliminada' } },
      }),
    });
    const { hook } = setup();
    act(() => hook.result.current.restore('t1'));
    expect(await screen.findByText('La principal está eliminada')).toBeInTheDocument();
    expect(screen.queryByText('Cosa restaurada')).not.toBeInTheDocument();
  });
});

describe('useRestore with two restores in flight (final review I1)', () => {
  it('shows the error of the first restore and keeps both ids busy while pending', async () => {
    let releaseFirst: () => void = () => undefined;
    let releaseSecond: () => void = () => undefined;
    mockApi({
      'POST /things/t1/restore': async () => {
        await new Promise<void>((resolve) => (releaseFirst = resolve));
        return {
          status: 409,
          body: { error: { code: 'PARENT_DELETED', message: 'Restaura primero la principal' } },
        };
      },
      'POST /things/t2/restore': async () => {
        await new Promise<void>((resolve) => (releaseSecond = resolve));
        return { status: 200, body: {} };
      },
    });
    const { hook } = setup();
    act(() => hook.result.current.restore('t1'));
    act(() => hook.result.current.restore('t2'));
    await waitFor(() => expect(hook.result.current.isRestoring('t1')).toBe(true));
    expect(hook.result.current.isRestoring('t2')).toBe(true);
    expect(hook.result.current.isRestoring('t3')).toBe(false);

    await act(async () => releaseFirst());
    expect(await screen.findByText('Restaura primero la principal')).toBeInTheDocument();
    await waitFor(() => expect(hook.result.current.isRestoring('t1')).toBe(false));
    expect(hook.result.current.isRestoring('t2')).toBe(true);

    await act(async () => releaseSecond());
    expect(await screen.findByText('Cosa restaurada')).toBeInTheDocument();
    await waitFor(() => expect(hook.result.current.isRestoring('t2')).toBe(false));
    expect(screen.getByText('Restaura primero la principal')).toBeInTheDocument();
  });
});
