import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Chips } from './Chips';

type Span = 'DAY' | 'WEEK' | 'MONTH';

function Harness({
  initial,
  onChange = vi.fn(),
}: {
  initial: Span | null;
  onChange?: (value: Span) => void;
}) {
  const [value, setValue] = useState<Span | null>(initial);
  return (
    <Chips
      ariaLabel="Frecuencia"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      options={[
        { value: 'DAY', label: 'Día' },
        { value: 'WEEK', label: 'Semana' },
        { value: 'MONTH', label: 'Mes' },
      ]}
    />
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });

describe('Chips keyboard (spec §7.1)', () => {
  it('has a single tab stop on the chosen option', async () => {
    render(<Harness initial="WEEK" />);
    await userEvent.tab();
    expect(radio('Semana')).toHaveFocus();
    expect(radio('Día')).toHaveAttribute('tabindex', '-1');
    expect(radio('Mes')).toHaveAttribute('tabindex', '-1');
  });

  it('starts on the first option when nothing is chosen', async () => {
    render(<Harness initial={null} />);
    await userEvent.tab();
    expect(radio('Día')).toHaveFocus();
    expect(radio('Día')).toHaveAttribute('aria-checked', 'false');
  });

  it('moves and chooses with the arrows, wrapping around', async () => {
    const onChange = vi.fn();
    render(<Harness initial="DAY" onChange={onChange} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(radio('Semana')).toHaveFocus();
    expect(radio('Semana')).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowRight}');
    expect(radio('Día')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await userEvent.keyboard('{ArrowUp}');
    expect(radio('Semana')).toHaveFocus();
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      'WEEK',
      'MONTH',
      'DAY',
      'MONTH',
      'WEEK',
    ]);
  });

  it('jumps to the ends with Home and End', async () => {
    render(<Harness initial="WEEK" />);
    await userEvent.tab();
    await userEvent.keyboard('{End}');
    expect(radio('Mes')).toHaveFocus();
    expect(radio('Mes')).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Home}');
    expect(radio('Día')).toHaveFocus();
    expect(radio('Día')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Chips selected style (spec §7.1)', () => {
  it('fills the chosen option so its text keeps AA contrast on any background', () => {
    render(<Harness initial="WEEK" />);
    // Relleno opaco: primary-fg sobre primary da 5,47:1 en claro y 9,18:1 en oscuro, sin importar el fondo.
    expect(radio('Semana')).toHaveClass('border-primary', 'bg-primary', 'text-primary-fg');
    expect(radio('Semana')).toHaveClass('font-medium');
    expect(radio('Semana')).not.toHaveClass('bg-primary/10');
    expect(radio('Semana')).not.toHaveClass('text-primary');
    expect(radio('Día')).toHaveClass('border-border', 'bg-surface', 'text-fg');
  });
});
