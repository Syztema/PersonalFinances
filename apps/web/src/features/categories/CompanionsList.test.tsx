import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmTwice, demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { CategoriesPage } from './CategoriesPage';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const option = (over: Record<string, unknown>) => ({
  id: 'p4',
  name: 'Amigos',
  icon: 'users',
  color: '#c2410c',
  isActive: true,
  sortOrder: 3,
  usageCount: 3,
  ...over,
});
const OPTIONS = [
  option({ id: 'p1', name: 'Solo', icon: 'user', color: '#475569', sortOrder: 0, usageCount: 0 }),
  option({
    id: 'p2',
    name: 'Pareja',
    icon: 'heart',
    color: '#be185d',
    sortOrder: 1,
    usageCount: 1,
  }),
  option({ id: 'p3', name: 'Vecinos', icon: 'home', isActive: false, sortOrder: 2, usageCount: 2 }),
  option({}),
];

function setup(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
    'GET /categories': () => ({ status: 200, body: { items: [] } }),
    'GET /companions': () => ({ status: 200, body: { items: OPTIONS } }),
    ...extra,
  });
}

describe('CompanionsList (spec con quién §3.3)', () => {
  it('opens on the tab from the link and lists active options with their use', async () => {
    setup();
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    expect(await screen.findByRole('radio', { name: 'Con quién' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await screen.findByRole('button', { name: /Amigos.*3 gastos/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pareja.*1 gasto/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solo.*Sin usar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Vecinos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva categoría' })).not.toBeInTheDocument();
  });

  it('switches to the tab when only the query changes', async () => {
    setup();
    renderWithProviders(
      <>
        <Link to="/categories?tab=companions">Editar opciones</Link>
        <CategoriesPage />
      </>,
      { route: '/categories' },
    );
    expect(await screen.findByRole('radio', { name: 'Gastos' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('link', { name: 'Editar opciones' }));
    expect(screen.getByRole('radio', { name: 'Con quién' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await screen.findByRole('button', { name: 'Nueva opción' })).toBeInTheDocument();
  });

  it('creates an option once even with a double tap, sending exactly name, icon and color', async () => {
    const posted: unknown[] = [];
    let release: () => void = () => undefined;
    setup({
      'POST /companions': async (body) => {
        posted.push(body);
        await new Promise<void>((resolve) => (release = resolve));
        return { status: 201, body: { companion: option({ id: 'p9', name: 'Primos' }) } };
      },
    });
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva opción' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nueva opción' });
    await userEvent.type(within(sheet).getByLabelText('Nombre'), 'Primos');
    await userEvent.click(within(sheet).getByRole('radio', { name: 'heart' }));
    await userEvent.click(within(sheet).getByRole('radio', { name: '#ec4899' }));
    const save = within(sheet).getByRole('button', { name: 'Guardar opción' });
    await userEvent.dblClick(save);
    // La petición queda retenida hasta aquí: el segundo toque llegó mientras volaba.
    await waitFor(() => expect(posted).toHaveLength(1));
    release();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nueva opción' })).not.toBeInTheDocument(),
    );
    expect(posted).toEqual([{ name: 'Primos', icon: 'heart', color: '#ec4899' }]);
    expect(await screen.findByText('Opción creada')).toBeInTheDocument();
  });

  it('shows a repeated name under the field', async () => {
    setup({
      'POST /companions': () => ({
        status: 409,
        body: {
          error: {
            code: 'COMPANION_NAME_TAKEN',
            message: 'Ya existe una opción eliminada con ese nombre; restáurala.',
          },
        },
      }),
    });
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva opción' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nueva opción' });
    await userEvent.type(within(sheet).getByLabelText('Nombre'), 'Vecinos');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar opción' }));
    expect(
      await within(sheet).findByText('Ya existe una opción eliminada con ese nombre; restáurala.'),
    ).toBeInTheDocument();
  });

  it('edits one option and deletes another keeping its history', async () => {
    const puts: unknown[] = [];
    const deletes: string[] = [];
    setup({
      'PUT /companions/p4': (body) => {
        puts.push(body);
        return { status: 200, body: { companion: option({ name: 'Amigos del barrio' }) } };
      },
      'DELETE /companions/p2': () => {
        deletes.push('p2');
        return { status: 200, body: { deleted: 'soft' } };
      },
    });
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    await userEvent.click(await screen.findByRole('button', { name: /Amigos.*3 gastos/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar opción' });
    const name = within(sheet).getByLabelText('Nombre');
    await userEvent.clear(name);
    await userEvent.type(name, 'Amigos del barrio');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar opción' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ name: 'Amigos del barrio', icon: 'users', color: '#c2410c' });

    await userEvent.click(await screen.findByRole('button', { name: /Pareja.*1 gasto/ }));
    await screen.findByRole('dialog', { name: 'Editar opción' });
    await confirmTwice('Eliminar opción');
    await waitFor(() => expect(deletes).toEqual(['p2']));
    expect(
      await screen.findByText('Opción eliminada: se conserva en tus gastos'),
    ).toBeInTheDocument();
  });

  it('restores a deleted option', async () => {
    const restored: string[] = [];
    setup({
      'POST /companions/p3/restore': () => {
        restored.push('p3');
        return { status: 200, body: { companion: option({ id: 'p3', name: 'Vecinos' }) } };
      },
    });
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    await userEvent.click(await screen.findByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Vecinos' }));
    await waitFor(() => expect(restored).toEqual(['p3']));
  });
});
