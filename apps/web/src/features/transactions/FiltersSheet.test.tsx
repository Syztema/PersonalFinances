import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { FiltersSheet } from './FiltersSheet';
import { EMPTY_FILTERS } from './filters';

afterEach(() => vi.unstubAllGlobals());

describe('FiltersSheet', () => {
  it('does not apply a custom range whose end is before its start', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [] } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: [] } }),
      'GET /categories': () => ({ status: 200, body: { items: [] } }),
      'GET /tags': () => ({ status: 200, body: { items: [] } }),
    });
    const onApply = vi.fn();
    renderWithProviders(
      <FiltersSheet open onOpenChange={() => undefined} value={EMPTY_FILTERS} onApply={onApply} />,
    );
    await userEvent.click(await screen.findByRole('radio', { name: 'Personalizado' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha final debe ser igual o posterior a la inicial',
    );
    const apply = screen.getByRole('button', { name: 'Aplicar' });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('filters by who, with "Sin indicar" and deleted options marked', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [] } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: [] } }),
      'GET /categories': () => ({ status: 200, body: { items: [] } }),
      'GET /tags': () => ({ status: 200, body: { items: [] } }),
      'GET /companions': () => ({
        status: 200,
        body: {
          items: [
            {
              id: 'p4',
              name: 'Amigos',
              icon: 'users',
              color: '#c2410c',
              isActive: true,
              sortOrder: 0,
              usageCount: 2,
            },
            {
              id: 'p3',
              name: 'Vecinos',
              icon: 'home',
              color: '#2563eb',
              isActive: false,
              sortOrder: 1,
              usageCount: 1,
            },
          ],
        },
      }),
    });
    const onApply = vi.fn();
    renderWithProviders(
      <FiltersSheet open onOpenChange={() => undefined} value={EMPTY_FILTERS} onApply={onApply} />,
    );
    const select = await screen.findByLabelText('Con quién');
    expect(await screen.findByRole('option', { name: 'Vecinos (eliminada)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sin indicar' })).toHaveAttribute('value', 'none');
    await userEvent.selectOptions(select, 'p4');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApply).toHaveBeenCalledWith({ ...EMPTY_FILTERS, companionId: 'p4' });
  });
});
