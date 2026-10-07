import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

const bar = (value: number, tone?: 'auto' | 'positive') => {
  render(<ProgressBar value={value} label="Uso" tone={tone} />);
  return screen.getByRole('progressbar', { name: 'Uso' });
};

describe('ProgressBar', () => {
  it('reports the percentage and caps the width at 100 %', () => {
    const el = bar(1.3);
    expect(el).toHaveAttribute('aria-valuenow', '130');
    expect((el.firstElementChild as HTMLElement).style.width).toBe('100%');
  });

  it('uses the primary color below 75 %', () => {
    expect(bar(0.5).firstElementChild).toHaveClass('bg-primary');
  });
  it('turns amber at 75 %', () => {
    expect(bar(0.75).firstElementChild).toHaveClass('bg-warning');
  });
  it('turns red at 90 %', () => {
    expect(bar(0.9).firstElementChild).toHaveClass('bg-negative');
  });
  it('goals always look positive', () => {
    expect(bar(0.95, 'positive').firstElementChild).toHaveClass('bg-positive');
  });
});
