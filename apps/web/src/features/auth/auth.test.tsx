import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '../../app/RequireAuth';
import { api } from '../../lib/api';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { qk } from '../../lib/queries';
import { LoginPage } from './LoginPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { useSessionExpiry } from './useSessionExpiry';

afterEach(() => vi.unstubAllGlobals());

function Protected({ children }: { children: ReactNode }) {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={children} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}

describe('RequireAuth', () => {
  it('renders the protected page with a valid session', async () => {
    mockApi({ 'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }) });
    renderWithProviders(
      <Protected>
        <p>Panel</p>
      </Protected>,
      { route: '/dashboard' },
    );
    expect(await screen.findByText('Panel')).toBeInTheDocument();
  });

  it('sends visitors without a session to the login page', async () => {
    mockApi({
      'GET /auth/me': () => ({
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Inicia sesión.' } },
      }),
    });
    renderWithProviders(
      <Protected>
        <p>Panel</p>
      </Protected>,
      { route: '/dashboard' },
    );
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(screen.queryByText(/Tu sesión expiró/)).not.toBeInTheDocument();
  });

  it('shows an offline screen instead of logging out on network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    renderWithProviders(
      <Protected>
        <p>Panel</p>
      </Protected>,
      { route: '/dashboard' },
    );
    expect(await screen.findByText(/Sin conexión/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('RequireAuth background refetch', () => {
  it('keeps the app when a background refetch of the session fails', async () => {
    let fail = false;
    const fetchMock = vi.fn(async () => {
      if (fail) throw new TypeError('offline');
      return new Response(JSON.stringify({ user: demoUser }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient } = renderWithProviders(
      <Protected>
        <p>Panel</p>
      </Protected>,
      { route: '/dashboard' },
    );
    expect(await screen.findByText('Panel')).toBeInTheDocument();
    fail = true;
    await queryClient.refetchQueries({ queryKey: qk.me });
    await waitFor(() => expect(queryClient.getQueryState(qk.me)?.status).toBe('error'));
    expect(screen.getByText('Panel')).toBeInTheDocument();
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  });
});

describe('session expiry while using the app (review focus #2)', () => {
  function DashboardThatExpires() {
    useSessionExpiry();
    useEffect(() => {
      api.get('/dashboard').catch(() => undefined);
    }, []);
    return <p>Panel</p>;
  }

  it('clears the session and shows the expired message on the login page', async () => {
    let meCalls = 0;
    mockApi({
      'GET /auth/me': () => {
        meCalls += 1;
        return meCalls === 1
          ? { status: 200, body: { user: demoUser } }
          : {
              status: 401,
              body: { error: { code: 'SESSION_EXPIRED', message: 'Tu sesión expiró.' } },
            };
      },
      'GET /dashboard': () => ({
        status: 401,
        body: { error: { code: 'SESSION_EXPIRED', message: 'Tu sesión expiró.' } },
      }),
    });
    renderWithProviders(
      <Protected>
        <DashboardThatExpires />
      </Protected>,
      { route: '/dashboard' },
    );
    expect(
      await screen.findByText('Tu sesión expiró. Inicia sesión de nuevo.'),
    ).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  it('posts the credentials and shows the API error message', async () => {
    const fetchMock = mockApi({
      'POST /auth/login': () => ({
        status: 401,
        body: {
          error: { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' },
        },
      }),
    });
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { route: '/login' },
    );
    await userEvent.type(screen.getByLabelText('Email'), 'demo@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          body: JSON.stringify({ email: 'demo@example.com', password: 'mala-clave' }),
        }),
      ),
    );
  });
});

describe('session start and password reset', () => {
  it('clears previously cached data on successful login', async () => {
    mockApi({ 'POST /auth/login': () => ({ status: 200, body: { user: demoUser } }) });
    const { queryClient } = renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<p>Panel</p>} />
      </Routes>,
      { route: '/login' },
    );
    queryClient.setQueryData(['accounts'], [{ id: 'old' }]);
    await userEvent.type(screen.getByLabelText('Email'), 'demo@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Panel')).toBeInTheDocument();
    expect(queryClient.getQueryData(['accounts'])).toBeUndefined();
    expect(queryClient.getQueryData(['me'])).toEqual(demoUser);
  });

  it('removes the reset token from the URL', async () => {
    window.history.replaceState(null, '', '/reset-password#token=abcdefghijklmnopqrstuvwxyz');
    renderWithProviders(
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>,
      { route: '/reset-password' },
    );
    expect(await screen.findByRole('heading', { name: 'Nueva contraseña' })).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });
});
