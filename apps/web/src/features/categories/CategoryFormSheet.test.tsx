import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { CategoryFormSheet } from './CategoryFormSheet';

afterEach(() => vi.unstubAllGlobals());

const parent = {
  id: 'p1',
  name: 'Hogar',
  kind: 'EXPENSE',
  parentId: null,
  bucket: 'OBLIGATIONS',
  icon: 'home',
  color: '#f97316',
  isSystem: false,
  systemKey: null,
  isActive: true,
  sortOrder: 1,
};

describe('CategoryFormSheet', () => {
  it('does not send bucket for a new subcategory when the bucket was not touched', async () => {
    const posted: Record<string, unknown>[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /categories': () => ({ status: 200, body: { items: [parent] } }),
      'POST /categories': (body) => {
        posted.push(body as Record<string, unknown>);
        return { status: 201, body: { category: { ...parent, id: 'c2' } } };
      },
    });
    renderWithProviders(<CategoryFormSheet open onOpenChange={() => undefined} kind="EXPENSE" />);
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Arriendo');
    await userEvent.selectOptions(await screen.findByLabelText(/Categoría principal/), 'p1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ name: 'Arriendo', parentId: 'p1' });
    expect(posted[0]).not.toHaveProperty('bucket');
  });
});
