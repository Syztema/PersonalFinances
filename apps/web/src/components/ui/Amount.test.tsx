import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Amount } from './Amount';

describe('Amount', () => {
  it('never shows a minus sign for the neutral tone', () => {
    render(<Amount value={-500000} tone="neutral" />);
    expect(screen.getByText('$500.000')).toBeInTheDocument();
  });
});

describe('Amount balance tone', () => {
  it('keeps the sign and turns red when negative', () => {
    render(<Amount value={-1000000} tone="balance" />);
    const el = screen.getByText('-$1.000.000');
    expect(el).toHaveClass('text-negative');
  });

  it('shows positive balances without color', () => {
    render(<Amount value={250000} tone="balance" />);
    expect(screen.getByText('$250.000')).not.toHaveClass('text-negative');
  });
});
