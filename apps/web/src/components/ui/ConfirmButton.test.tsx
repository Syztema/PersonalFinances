import { render, screen } from '@testing-library/react';
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
});
