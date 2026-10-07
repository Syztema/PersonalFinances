import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeletedSection } from './DeletedSection';

describe('DeletedSection', () => {
  it('stays folded until opened and restores an item', async () => {
    const onRestore = vi.fn();
    render(
      <DeletedSection
        items={[{ id: 'a9', name: 'Vieja' }]}
        onRestore={onRestore}
        isRestoring={() => false}
      />,
    );
    expect(screen.queryByText('Vieja')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Vieja' }));
    expect(onRestore).toHaveBeenCalledWith({ id: 'a9', name: 'Vieja' });
  });

  it('renders nothing without deleted items', () => {
    const { container } = render(
      <DeletedSection items={[]} onRestore={() => undefined} isRestoring={() => false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
