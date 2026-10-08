import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmButton } from './ConfirmButton';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('ConfirmButton', () => {
  it('arms on the first click without confirming', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton onConfirm={onConfirm}>Eliminar</ConfirmButton>);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('¿Seguro? Toca de nuevo');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ignores a double tap right after arming', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton onConfirm={onConfirm}>Eliminar</ConfirmButton>);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms once on a later second tap', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton onConfirm={onConfirm}>Eliminar</ConfirmButton>);
    await userEvent.click(screen.getByRole('button'));
    await vi.advanceTimersByTimeAsync(500);
    await userEvent.click(screen.getByRole('button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('names and announces the second step (spec §7.1)', async () => {
    render(<ConfirmButton onConfirm={vi.fn()}>Eliminar meta</ConfirmButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar meta' }));
    expect(screen.getByRole('button', { name: 'Confirmar: Eliminar meta' })).toHaveTextContent(
      '¿Seguro? Toca de nuevo',
    );
    expect(screen.getByText('Confirmar: Eliminar meta')).toHaveAttribute('aria-live', 'polite');
  });

  it('builds the name from aria-label when there is one', async () => {
    render(
      <ConfirmButton aria-label="Eliminar Arriendo" onConfirm={vi.fn()}>
        Eliminar
      </ConfirmButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Arriendo' }));
    expect(
      screen.getByRole('button', { name: 'Confirmar: Eliminar Arriendo' }),
    ).toBeInTheDocument();
  });

  it('goes back to its first step after 3 seconds and clears the announcement', async () => {
    render(<ConfirmButton onConfirm={vi.fn()}>Eliminar</ConfirmButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await act(() => vi.advanceTimersByTimeAsync(3100));
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveTextContent('Eliminar');
    expect(screen.queryByText('Confirmar: Eliminar')).not.toBeInTheDocument();
  });
});
