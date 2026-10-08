import { act, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../test-utils';
import { AppLayout } from './AppLayout';

// El chunk del aviso de versión nueva no llega (red caída o un despliegue entre la entrada y el
// chunk). La prueba decide cuándo falla la carga.
const chunk = vi.hoisted(() => {
  let fail!: () => void;
  const failed = new Promise<void>((resolve) => (fail = resolve));
  return { fail, failed };
});
vi.mock('./UpdatePrompt', async () => {
  await chunk.failed;
  throw new Error('Failed to fetch dynamically imported module');
});

afterEach(() => vi.unstubAllGlobals());

describe('AppLayout (final review 3B, Important 3)', () => {
  it('keeps the navigation and the page when the update prompt chunk fails to load', async () => {
    mockApi({ 'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }) });
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<h1>Pantalla de prueba</h1>} />
        </Route>
      </Routes>,
    );
    expect(screen.getByRole('heading', { name: 'Pantalla de prueba' })).toBeInTheDocument();
    await act(async () => {
      chunk.fail();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pantalla de prueba' })).toBeInTheDocument();
    expect(screen.queryByText('Nueva versión disponible')).not.toBeInTheDocument();
  });
});
