import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MorePage } from '../features/more/MorePage';
import { QuickAddProvider } from '../features/quick-add/QuickAddContext';
import { renderWithProviders } from '../test-utils';
import { Sidebar } from './Sidebar';

describe('navigation to Reportes (spec §5.1)', () => {
  it('is the first option of "Más"', () => {
    renderWithProviders(<MorePage />);
    const [first] = screen.getAllByRole('link');
    expect(first).toHaveAccessibleName('Reportes');
    expect(first).toHaveAttribute('href', '/reports');
  });

  it('comes right after Presupuestos in the sidebar', () => {
    renderWithProviders(
      <QuickAddProvider>
        <Sidebar />
      </QuickAddProvider>,
    );
    const names = within(screen.getByRole('navigation', { name: 'Navegación' }))
      .getAllByRole('link')
      .map((link) => link.textContent?.trim());
    expect(names.slice(0, 4)).toEqual(['Inicio', 'Movimientos', 'Presupuestos', 'Reportes']);
  });
});
