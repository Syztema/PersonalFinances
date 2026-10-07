import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { AlertsPage } from './AlertsPage';

afterEach(() => vi.unstubAllGlobals());

const alerts = {
  status: {
    level: 'WARNING',
    title: 'Cuidado',
    message: 'Has utilizado el 78 % de tu presupuesto y quedan 12 días.',
  },
  items: [
    {
      key: 'obligation-overdue:s1:2026-10-05',
      level: 'DANGER',
      title: 'Arriendo está vencida',
      message: 'Vencía el 05 oct: $1.000.000.',
      href: '/recurring',
    },
    {
      key: 'low-balance:2026-10-20',
      level: 'WARNING',
      title: 'Tu dinero disponible está bajo',
      message: 'Disponible estimado: $50.000.',
      href: null,
    },
  ],
};

describe('AlertsPage (spec 8.12)', () => {
  it('shows the status and dismisses or restores alerts', async () => {
    const calls: string[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /alerts': () => ({ status: 200, body: alerts }),
      'POST /alerts/low-balance:2026-10-20/dismiss': () => {
        calls.push('dismiss');
        return { status: 204 };
      },
      'DELETE /alerts/dismissed': () => {
        calls.push('restore');
        return { status: 204 };
      },
    });
    renderWithProviders(<AlertsPage />);
    expect(await screen.findByText('Cuidado')).toBeInTheDocument();
    expect(screen.getByText('Arriendo está vencida')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/recurring');
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Atención')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Descartar: Tu dinero disponible está bajo' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar las alertas descartadas' }));
    await waitFor(() => expect(calls).toEqual(['dismiss', 'restore']));
  });

  it('keeps the alert and shows the error when dismissing fails', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /alerts': () => ({ status: 200, body: alerts }),
      'POST /alerts/low-balance:2026-10-20/dismiss': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'No pudimos descartar la alerta.' } },
      }),
    });
    renderWithProviders(<AlertsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Descartar: Tu dinero disponible está bajo' }),
    );
    expect(await screen.findByText('No pudimos descartar la alerta.')).toBeInTheDocument();
    expect(screen.getByText('Tu dinero disponible está bajo')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Descartar: Tu dinero disponible está bajo' }),
    ).toBeEnabled();
  });

  it('shows the error when restoring fails', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /alerts': () => ({ status: 200, body: alerts }),
      'DELETE /alerts/dismissed': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'No pudimos restaurar las alertas.' } },
      }),
    });
    renderWithProviders(<AlertsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mostrar las alertas descartadas' }),
    );
    expect(await screen.findByText('No pudimos restaurar las alertas.')).toBeInTheDocument();
  });

  it('shows an empty state when there are no alerts', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /alerts': () => ({
        status: 200,
        body: { items: [], status: { level: 'OK', title: 'Vas bien', message: 'Todo en orden.' } },
      }),
    });
    renderWithProviders(<AlertsPage />);
    expect(await screen.findByText('Vas bien')).toBeInTheDocument();
    expect(screen.getByText('No tienes alertas por ahora.')).toBeInTheDocument();
  });
});
