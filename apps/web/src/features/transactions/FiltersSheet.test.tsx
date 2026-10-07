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
});
