import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyInput } from './MoneyInput';

function Harness({ onValue }: { onValue: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(null);
  return (
    <MoneyInput
      aria-label="Valor"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
}

describe('MoneyInput (review focus #3)', () => {
  it('formats while typing and reports integers', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText('Valor');
    await userEvent.type(input, '25000');
    expect(input).toHaveValue('$25.000');
    expect(onValue).toHaveBeenLastCalledWith(25000);
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('accepts pasted amounts with a decimal part and can be cleared', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText('Valor');
    await userEvent.click(input);
    await userEvent.paste('$1.500.000,50');
    expect(input).toHaveValue('$1.500.000');
    expect(onValue).toHaveBeenLastCalledWith(1500000);
    await userEvent.clear(input);
    expect(input).toHaveValue('');
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('ignores values above the maximum', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.type(screen.getByLabelText('Valor'), '10000000000000');
    expect(onValue).not.toHaveBeenCalledWith(10_000_000_000_000);
  });
});
