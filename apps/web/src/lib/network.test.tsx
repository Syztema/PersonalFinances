import { useMutation } from '@tanstack/react-query';
import type { UserDTO } from '@finanzas/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Routes, Route } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../components/ui/Button';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { OfflineState } from '../components/ui/OfflineState';
import { PageSpinner } from '../components/ui/Spinner';
import { CardDetailPage } from '../features/cards/CardDetailPage';
import { QuickAddProvider } from '../features/quick-add/QuickAddContext';
import { ThemeCard } from '../features/profile/ThemeCard';
import { useSaveTransaction } from '../features/quick-add/useSaveTransaction';
import { demoUser, mockApi, renderWithProviders, setOnline } from '../test-utils';
import { api } from './api';
import { useAccounts } from './queries';
import { createQueryClient } from './queryClient';

afterEach(() => vi.unstubAllGlobals());

const BANNER = 'Sin conexión — no se puede guardar hasta que vuelva la red';
const NETWORK_ERROR = 'Sin conexión. Revisa tu internet e intenta de nuevo.';
const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));

describe('offline banner (spec §6)', () => {
  it('appears when the network drops and goes away when it returns', () => {
    render(<OfflineBanner />);
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    setOnline(false);
    expect(screen.getByRole('status')).toHaveTextContent(BANNER);
    setOnline(true);
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });
});

describe('buttons without network', () => {
  it('disables submit, confirm and marked action buttons, not the others', () => {
    render(
      <>
        <Button type="submit">Guardar</Button>
        <Button requiresNetwork>Restaurar</Button>
        <ConfirmButton onConfirm={vi.fn()}>Eliminar</ConfirmButton>
        <Button>Ver detalle</Button>
        <Button type="submit" requiresNetwork={false}>
          Buscar
        </Button>
      </>,
    );
    setOnline(false);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restaurar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver detalle' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeEnabled();
    setOnline(true);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeEnabled();
  });
});

function SaveForm() {
  const { submit, isPending } = useSaveTransaction('Gasto guardado');
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(
          { path: '/transactions', method: 'POST', body: { type: 'EXPENSE', amount: 25_000 } },
          { onError: (err) => setError(err.message) },
        );
      }}
    >
      {error && <p role="alert">{error}</p>}
      <Button type="submit" loading={isPending}>
        Guardar
      </Button>
    </form>
  );
}

describe('saving while the network drops (review focus #2)', () => {
  it('fails at once, never resends when the network returns and re-enables the button', async () => {
    let fail: (error: Error) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((_, reject) => {
          fail = reject;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<SaveForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setOnline(false);
    await act(async () => fail(new TypeError('Failed to fetch')));
    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    setOnline(true);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never queues a mutation started without network (networkMode always)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    function DismissButton() {
      const dismiss = useMutation({
        mutationFn: () => api.post('/alerts/dismiss', { key: 'budget:2026-10:total:75' }),
      });
      return (
        <>
          <button type="button" onClick={() => dismiss.mutate()}>
            Descartar
          </button>
          {dismiss.isError && <p role="alert">{dismiss.error.message}</p>}
        </>
      );
    }
    renderWithProviders(<DismissButton />);
    setOnline(false);
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    setOnline(true);
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('configures the app client the same way', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.networkMode).toBe('always');
  });
});

function AccountsProbe() {
  const accounts = useAccounts();
  if (accounts.isPending) return <PageSpinner />;
  return <p>Cuentas: {accounts.data?.length}</p>;
}

describe('screens without data and without network', () => {
  it('say "Sin conexión" while the query is paused and load when the network returns', async () => {
    const fetchMock = mockApi({ 'GET /accounts': () => ({ status: 200, body: { items: [] } }) });
    setOnline(false);
    renderWithProviders(<AccountsProbe />);
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
    setOnline(true);
    expect(await screen.findByText('Cuentas: 0')).toBeInTheDocument();
  });
});

describe('fix round 1: remaining offline gaps', () => {
  it('disables the theme options offline and sends no PATCH', async () => {
    const fetchMock = mockApi({});
    renderWithProviders(<ThemeCard user={{ ...demoUser, theme: 'DARK' } as UserDTO} />);
    setOnline(false);
    const light = screen.getByRole('radio', { name: 'Claro' });
    expect(light).toBeDisabled();
    await userEvent.click(light);
    await userEvent.keyboard('{ArrowRight}');
    expect(fetchMock).not.toHaveBeenCalled();
    setOnline(true);
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeEnabled();
  });

  it('says "Sigue sin conexión" when retrying while still offline', async () => {
    mockApi({});
    setOnline(false);
    renderWithProviders(<OfflineState />);
    expect(screen.queryByText('Sigue sin conexión')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByRole('status')).toHaveTextContent('Sigue sin conexión');
  });

  it('disables the restore button on the card detail offline', async () => {
    const card = {
      id: 'c1',
      name: 'Vieja',
      issuer: null,
      creditLimit: 5_000_000,
      initialDebt: 0,
      initialDebtInstallments: 1,
      openingDate: '2026-10-01',
      statementDay: 15,
      paymentDueDay: 30,
      icon: 'credit-card',
      color: '#820ad1',
      isActive: false,
      sortOrder: 0,
      debt: 100_000,
      available: 4_900_000,
      utilization: 0,
      amountDue: 0,
      dueDate: '2026-10-30',
      isOverdue: false,
      lastCutoff: '2026-10-15',
      nextCutoff: '2026-11-15',
      nextDueDate: '2026-11-30',
      committed: 0,
    };
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /credit-cards/c1/statement': () => ({ status: 200, body: { card, upcoming: [] } }),
      'GET /transactions': () => ({ status: 200, body: { items: [], nextCursor: null } }),
    });
    renderWithProviders(
      <QuickAddProvider>
        <Routes>
          <Route path="/cards/:id" element={<CardDetailPage />} />
        </Routes>
      </QuickAddProvider>,
      { route: '/cards/c1' },
    );
    const restore = await screen.findByRole('button', { name: 'Restaurar' });
    expect(restore).toBeEnabled();
    setOnline(false);
    expect(restore).toBeDisabled();
  });
});
