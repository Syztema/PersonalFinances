import type { TransactionDTO } from '@finanzas/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransactionRow } from './TransactionRow';

const ref = (id: string, name: string) => ({
  id,
  name,
  icon: 'wallet',
  color: '#123456',
  isActive: true,
});
const base: TransactionDTO = {
  id: 't1',
  type: 'EXPENSE',
  amount: 25_000,
  date: '2026-10-06',
  description: null,
  payee: null,
  notes: null,
  account: null,
  toAccount: null,
  creditCard: null,
  debt: null,
  category: null,
  goalId: null,
  installments: null,
  paymentMethod: null,
  method: null,
  parentId: null,
  interest: 0,
  tags: [],
  createdAt: '2026-10-06T15:00:00.000Z',
};

describe('TransactionRow', () => {
  it('shows a card payment as a neutral payment, never as an expense (review focus #4)', () => {
    render(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{
          ...base,
          type: 'CARD_PAYMENT',
          amount: 500_000,
          account: { ...ref('a1', 'Bancolombia'), type: 'BANK' },
          creditCard: ref('c1', 'Nu Crédito'),
        }}
      />,
    );
    expect(screen.getByText('Pago tarjeta')).toBeInTheDocument();
    expect(screen.getByText('Bancolombia → Nu Crédito')).toBeInTheDocument();
    const amount = screen.getByText('$500.000');
    expect(amount).not.toHaveClass('text-negative');
    expect(screen.queryByText('-$500.000')).not.toBeInTheDocument();
  });

  it('shows expenses in red with a minus sign and their category and account', () => {
    render(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{
          ...base,
          description: 'Almuerzo',
          account: { ...ref('a2', 'Nequi'), type: 'DIGITAL_WALLET' },
          category: { ...ref('k1', 'Alimentación'), kind: 'EXPENSE', parentId: null },
        }}
      />,
    );
    expect(screen.getByText('Almuerzo')).toBeInTheDocument();
    expect(screen.getByText('Alimentación · Nequi')).toBeInTheDocument();
    expect(screen.getByText('-$25.000')).toHaveClass('text-negative');
  });

  it('describes transfers, income and card purchases with installments', () => {
    const { rerender } = render(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{
          ...base,
          type: 'TRANSFER',
          amount: 200_000,
          account: { ...ref('a1', 'Bancolombia'), type: 'BANK' },
          toAccount: { ...ref('a2', 'Nequi'), type: 'DIGITAL_WALLET' },
        }}
      />,
    );
    expect(screen.getByText('Bancolombia → Nequi')).toBeInTheDocument();
    expect(screen.getByText('$200.000')).not.toHaveClass('text-negative');

    rerender(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{
          ...base,
          type: 'INCOME',
          amount: 4_000_000,
          description: 'Salario',
          account: { ...ref('a1', 'Bancolombia'), type: 'BANK' },
        }}
      />,
    );
    expect(screen.getByText('+$4.000.000')).toHaveClass('text-positive');

    rerender(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{
          ...base,
          type: 'CARD_PURCHASE',
          amount: 150_000,
          description: 'Amazon',
          installments: 3,
          creditCard: ref('c1', 'Nu Crédito'),
        }}
      />,
    );
    expect(screen.getByText('Nu Crédito · 3 cuotas')).toBeInTheDocument();
    expect(screen.getByText('-$150.000')).toBeInTheDocument();
  });

  it('marks a deleted account in the subtitle', () => {
    render(
      <TransactionRow
        transaction={{
          ...base,
          type: 'EXPENSE',
          account: { ...ref('a1', 'Nequi'), isActive: false, type: 'DIGITAL_WALLET' },
          category: { ...ref('k1', 'Mercado'), kind: 'EXPENSE', parentId: null },
          description: 'Compra',
        }}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText(/Nequi \(eliminada\)/)).toBeInTheDocument();
  });
});

describe('TransactionRow icon contrast (final review I2)', () => {
  const iconBadge = () => document.querySelector('span.rounded-full') as HTMLElement;

  it('uses a token foreground on token backgrounds (transfers, uncategorised movements)', () => {
    const { rerender } = render(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{ ...base, type: 'TRANSFER', amount: 1000 }}
      />,
    );
    expect(iconBadge()).toHaveClass('text-surface');
    expect(iconBadge()).not.toHaveClass('text-white');
    rerender(<TransactionRow onSelect={() => undefined} transaction={base} />);
    expect(iconBadge()).toHaveClass('text-surface');
    rerender(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{ ...base, type: 'INCOME', description: 'Salario' }}
      />,
    );
    expect(iconBadge()).toHaveClass('text-surface');
  });

  it('keeps white on user-chosen category colors', () => {
    render(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{
          ...base,
          category: { ...ref('k1', 'Mercado'), kind: 'EXPENSE', parentId: null },
        }}
      />,
    );
    expect(iconBadge()).toHaveClass('text-white');
    expect(iconBadge()).not.toHaveClass('text-surface');
  });
});
