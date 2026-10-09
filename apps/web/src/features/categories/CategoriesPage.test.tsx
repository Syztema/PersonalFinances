import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmTwice, demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { CategoriesPage } from './CategoriesPage';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const cat = (over: Record<string, unknown>) => ({
  id: 'k1',
  name: 'Alimentación',
  kind: 'EXPENSE',
  parentId: null,
  bucket: 'OBLIGATIONS',
  icon: 'utensils',
  color: '#f97316',
  isSystem: false,
  systemKey: null,
  isActive: true,
  sortOrder: 1,
  ...over,
});

describe('CategoriesPage', () => {
  it('lists system categories, folds deleted ones and restores them', async () => {
    const restored: string[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /categories': () => ({
        status: 200,
        body: {
          items: [
            cat({}),
            cat({
              id: 'k2',
              name: 'Ajuste de saldo',
              isSystem: true,
              systemKey: 'ADJUSTMENT_EXPENSE',
              bucket: 'OTHER',
            }),
            cat({ id: 'k3', name: 'Mascotas', isActive: false, bucket: 'OTHER' }),
          ],
        },
      }),
      'POST /categories/k3/restore': () => {
        restored.push('k3');
        return { status: 200, body: { category: cat({ id: 'k3', name: 'Mascotas' }) } };
      },
    });
    renderWithProviders(<CategoriesPage />);
    expect(await screen.findByText('Ajuste de saldo')).toBeInTheDocument();
    expect(screen.getByText('Del sistema')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Mascotas' }));
    await waitFor(() => expect(restored).toEqual(['k3']));
  });

  it('ignores an inherited property name in ?tab= and falls back to Gastos', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /categories': () => ({ status: 200, body: { items: [cat({})] } }),
    });
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=constructor' });
    expect(await screen.findByRole('radio', { name: 'Gastos' })).toBeChecked();
  });

  it('renames a tag from the Etiquetas tab and shows the lower-cased name', async () => {
    const renamed: unknown[] = [];
    let tagName = 'viaje';
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /categories': () => ({ status: 200, body: { items: [cat({})] } }),
      'GET /tags': () => ({
        status: 200,
        body: { items: [{ id: 't1', name: tagName, usageCount: 3 }] },
      }),
      'PUT /tags/t1': (body) => {
        renamed.push(body);
        tagName = 'vacaciones';
        return { status: 200, body: { tag: { id: 't1', name: tagName, usageCount: 3 } } };
      },
    });
    renderWithProviders(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Etiquetas' }));
    await userEvent.click(await screen.findByRole('button', { name: /#viaje/ }));
    const input = screen.getByLabelText('Nombre de la etiqueta');
    await userEvent.clear(input);
    await userEvent.type(input, 'Vacaciones');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar etiqueta' }));
    await waitFor(() => expect(renamed).toEqual([{ name: 'Vacaciones' }]));
    expect(await screen.findByRole('button', { name: /#vacaciones/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /#viaje/ })).not.toBeInTheDocument();
  });

  it('shows TAG_NAME_TAKEN under the name field and clears it when typing', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /categories': () => ({ status: 200, body: { items: [cat({})] } }),
      'GET /tags': () => ({
        status: 200,
        body: { items: [{ id: 't1', name: 'viaje', usageCount: 3 }] },
      }),
      'PUT /tags/t1': () => ({
        status: 409,
        body: {
          error: { code: 'TAG_NAME_TAKEN', message: 'Ya existe una etiqueta con ese nombre' },
        },
      }),
    });
    renderWithProviders(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Etiquetas' }));
    await userEvent.click(await screen.findByRole('button', { name: /#viaje/ }));
    await userEvent.type(screen.getByLabelText('Nombre de la etiqueta'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar etiqueta' }));
    expect(await screen.findByText('Ya existe una etiqueta con ese nombre')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nombre de la etiqueta'), 'y');
    expect(screen.queryByText('Ya existe una etiqueta con ese nombre')).not.toBeInTheDocument();
  });

  it('toasts the error when deleting a tag fails', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /categories': () => ({ status: 200, body: { items: [cat({})] } }),
      'GET /tags': () => ({
        status: 200,
        body: { items: [{ id: 't1', name: 'viaje', usageCount: 3 }] },
      }),
      'DELETE /tags/t1': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'No se pudo eliminar' } },
      }),
    });
    renderWithProviders(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Etiquetas' }));
    await userEvent.click(await screen.findByRole('button', { name: /#viaje/ }));
    await confirmTwice('Eliminar etiqueta');
    expect(await screen.findByText('No se pudo eliminar')).toBeInTheDocument();
  });
});
