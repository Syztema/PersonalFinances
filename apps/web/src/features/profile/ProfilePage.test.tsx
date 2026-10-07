import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY } from '../../lib/theme';
import { confirmTwice, demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { ProfilePage } from './ProfilePage';

const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(THEME_KEY, 'DARK');
  html.classList.add('dark');
});
afterEach(() => vi.unstubAllGlobals());

describe('ProfilePage — appearance', () => {
  it('switches to the light theme right away and saves it', async () => {
    const patches: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'PATCH /me': (body) => {
        patches.push(body);
        return { status: 200, body: { user: { ...demoUser, theme: 'LIGHT' } } };
      },
    });
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Claro' }));
    expect(html.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('LIGHT');
    await waitFor(() => expect(patches).toEqual([{ theme: 'LIGHT' }]));
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute('aria-checked', 'true');
  });

  it('goes back to the previous theme and warns when saving fails', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'PATCH /me': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'Error' } },
      }),
    });
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Claro' }));
    expect(await screen.findByText('No se pudo guardar el tema')).toBeInTheDocument();
    expect(html.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe('DARK');
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toHaveAttribute('aria-checked', 'true');
  });
});

const withLogin = (
  <Routes>
    <Route path="/" element={<ProfilePage />} />
    <Route path="/login" element={<p>Pantalla de ingreso</p>} />
  </Routes>
);

const rateLimited = {
  status: 429,
  body: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos, espera un rato' } },
};

describe('ProfilePage — account', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  async function fillEmail(email: string, password: string) {
    await userEvent.type(await screen.findByLabelText('Nuevo email'), email);
    await userEvent.type(screen.getByLabelText('Contraseña actual para confirmar'), password);
  }

  async function fillDelete(password: string) {
    await userEvent.type(await screen.findByLabelText('Tu contraseña'), password);
    await userEvent.type(screen.getByLabelText('Escribe ELIMINAR para confirmar'), 'ELIMINAR');
  }

  it('changes the email with the current password and shows the server value', async () => {
    const patches: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'PATCH /me': (body) => {
        patches.push(body);
        return { status: 200, body: { user: { ...demoUser, email: 'nuevo@correo.co' } } };
      },
    });
    renderWithProviders(<ProfilePage />);
    await fillEmail('Nuevo@Correo.co', 'clave-segura-123');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar email' }));
    await waitFor(() =>
      expect(patches).toEqual([{ email: 'Nuevo@Correo.co', currentPassword: 'clave-segura-123' }]),
    );
    expect(await screen.findByText('Actual: nuevo@correo.co')).toBeInTheDocument();
    expect(screen.getByText('Email actualizado. Cerramos tus otras sesiones.')).toBeInTheDocument();
  });

  it('shows the wrong password under its field', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'PATCH /me': () => ({
        status: 400,
        body: {
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Contraseña incorrecta',
            fields: { currentPassword: 'La contraseña no es correcta' },
          },
        },
      }),
    });
    renderWithProviders(<ProfilePage />);
    await fillEmail('nuevo@correo.co', 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar email' }));
    expect(await screen.findByText('La contraseña no es correcta')).toBeInTheDocument();
  });

  it('shows a taken email in the general error', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'PATCH /me': () => ({
        status: 409,
        body: { error: { code: 'EMAIL_TAKEN', message: 'Ese email ya está registrado' } },
      }),
    });
    renderWithProviders(<ProfilePage />);
    await fillEmail('otro@correo.co', 'clave-segura-123');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar email' }));
    expect(await screen.findByText('Ese email ya está registrado')).toBeInTheDocument();
  });

  it('shows the rate limit message and keeps the email form filled', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'PATCH /me': () => rateLimited,
    });
    renderWithProviders(<ProfilePage />);
    await fillEmail('otro@correo.co', 'clave-segura-123');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar email' }));
    expect(await screen.findByText('Demasiados intentos, espera un rato')).toBeInTheDocument();
    expect(screen.getByLabelText('Nuevo email')).toHaveValue('otro@correo.co');
    expect(screen.getByLabelText('Contraseña actual para confirmar')).toHaveValue(
      'clave-segura-123',
    );
  });

  it('deletes the account only after typing ELIMINAR, then goes to login', async () => {
    const deletes: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'DELETE /me': (body) => {
        deletes.push(body);
        return { status: 204 };
      },
    });
    const { queryClient } = renderWithProviders(withLogin);
    const button = await screen.findByRole('button', { name: 'Eliminar mi cuenta y mis datos' });
    expect(button).toBeDisabled();
    const confirmation = screen.getByLabelText('Escribe ELIMINAR para confirmar');
    await userEvent.type(screen.getByLabelText('Tu contraseña'), 'clave-segura-123');
    await userEvent.type(confirmation, 'eliminar');
    expect(button).toBeDisabled();
    await userEvent.clear(confirmation);
    await userEvent.type(confirmation, 'ELIMINAR');
    expect(button).toBeEnabled();
    await confirmTwice('Eliminar mi cuenta y mis datos');
    await waitFor(() =>
      expect(deletes).toEqual([{ password: 'clave-segura-123', confirmation: 'ELIMINAR' }]),
    );
    expect(await screen.findByText('Pantalla de ingreso')).toBeInTheDocument();
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
  });

  it('never sends the delete twice on a double tap', async () => {
    let calls = 0;
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'DELETE /me': async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { status: 204 };
      },
    });
    renderWithProviders(withLogin);
    await fillDelete('clave-segura-123');
    await confirmTwice('Eliminar mi cuenta y mis datos');
    const button = screen.getByRole('button', { name: 'Eliminar mi cuenta y mis datos' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(await screen.findByText('Pantalla de ingreso')).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('shows a wrong delete password under the password field', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'DELETE /me': () => ({
        status: 400,
        body: {
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Contraseña incorrecta',
            fields: { password: 'La contraseña no es correcta' },
          },
        },
      }),
    });
    renderWithProviders(<ProfilePage />);
    await fillDelete('mala');
    await confirmTwice('Eliminar mi cuenta y mis datos');
    expect(await screen.findByText('La contraseña no es correcta')).toBeInTheDocument();
  });

  it('shows the rate limit message when deleting and keeps the form', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'DELETE /me': () => rateLimited,
    });
    renderWithProviders(<ProfilePage />);
    await fillDelete('clave-segura-123');
    await confirmTwice('Eliminar mi cuenta y mis datos');
    expect(await screen.findByText('Demasiados intentos, espera un rato')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu contraseña')).toHaveValue('clave-segura-123');
  });
});

describe('ProfilePage — email unchanged (final review M3)', () => {
  it('does not send anything when the typed email is the current one in another case', async () => {
    const patches: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'PATCH /me': (body) => {
        patches.push(body);
        return { status: 200, body: { user: demoUser } };
      },
    });
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText('Nuevo email'), '  Demo@Example.com ');
    await userEvent.type(screen.getByLabelText('Contraseña actual para confirmar'), 'clave');
    expect(screen.getByText('Ese ya es tu email.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Cambiar email' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(patches).toEqual([]);
    expect(screen.queryByText(/Cerramos tus otras sesiones/)).not.toBeInTheDocument();
  });
});

describe('ProfilePage — local data and confirmation input (final review M7, M9)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(THEME_KEY, 'DARK');
    localStorage.setItem('fz:lastSource', '{"kind":"account","id":"a1"}');
    localStorage.setItem('fz:categoryUse', '{"k1":3}');
  });

  it('asks phone keyboards for capitals without autocorrect on the ELIMINAR input', async () => {
    mockApi({ 'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }) });
    renderWithProviders(<ProfilePage />);
    const input = await screen.findByLabelText('Escribe ELIMINAR para confirmar');
    expect(input).toHaveAttribute('autocapitalize', 'characters');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });

  it('forgets the remembered source and category use on logout, keeping the theme', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'POST /auth/logout': () => ({ status: 204 }),
    });
    renderWithProviders(withLogin);
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByText('Pantalla de ingreso')).toBeInTheDocument();
    expect(localStorage.getItem('fz:lastSource')).toBeNull();
    expect(localStorage.getItem('fz:categoryUse')).toBeNull();
    expect(localStorage.getItem(THEME_KEY)).toBe('DARK');
  });

  it('forgets them when the account is deleted, keeping the theme', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockApi({
        'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
        'DELETE /me': () => ({ status: 204 }),
      });
      renderWithProviders(withLogin);
      await userEvent.type(await screen.findByLabelText('Tu contraseña'), 'clave-segura-123');
      await userEvent.type(screen.getByLabelText('Escribe ELIMINAR para confirmar'), 'ELIMINAR');
      await confirmTwice('Eliminar mi cuenta y mis datos');
      expect(await screen.findByText('Pantalla de ingreso')).toBeInTheDocument();
      expect(localStorage.getItem('fz:lastSource')).toBeNull();
      expect(localStorage.getItem('fz:categoryUse')).toBeNull();
      expect(localStorage.getItem(THEME_KEY)).toBe('DARK');
    } finally {
      vi.useRealTimers();
    }
  });
});
