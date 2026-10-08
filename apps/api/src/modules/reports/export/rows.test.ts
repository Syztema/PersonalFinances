import { describe, expect, it } from 'vitest';
import { EXPORT_TYPE_LABELS, guardFormula, toExportRow, type ExportTransaction } from './rows';

const lunch: ExportTransaction = {
  type: 'EXPENSE',
  date: '2026-10-07',
  amount: 45_000,
  description: 'Almuerzo',
  notes: null,
  installments: null,
  paymentMethod: null,
  account: { name: 'Bancolombia', type: 'BANK' },
  toAccount: null,
  creditCard: null,
  debt: null,
  category: { name: 'Restaurantes', parent: { name: 'Alimentación' } },
  tags: ['comida', 'trabajo'],
};

describe('toExportRow (spec Fase 3 §4)', () => {
  it('splits main category and subcategory and derives the payment method', () => {
    expect(toExportRow(lunch)).toEqual({
      date: '2026-10-07',
      type: 'Gasto',
      description: 'Almuerzo',
      category: 'Alimentación',
      subcategory: 'Restaurantes',
      account: 'Bancolombia',
      toAccount: '',
      card: '',
      loan: '',
      installments: null,
      method: 'Cuenta bancaria',
      amount: 45_000,
      tags: 'comida, trabajo',
      notes: '',
    });
  });

  it('uses the chosen method and leaves the subcategory empty for a main category', () => {
    const row = toExportRow({
      ...lunch,
      paymentMethod: 'DEBIT_CARD',
      category: { name: 'Alimentación', parent: null },
      tags: [],
      notes: 'con factura',
    });
    expect(row).toMatchObject({
      category: 'Alimentación',
      subcategory: '',
      method: 'Tarjeta débito',
      tags: '',
      notes: 'con factura',
    });
  });

  it('fills card, installments and the credit card method of a card purchase', () => {
    const row = toExportRow({
      ...lunch,
      type: 'CARD_PURCHASE',
      account: null,
      creditCard: { name: 'Nu Crédito' },
      installments: 12,
    });
    expect(row).toMatchObject({
      type: 'Compra con tarjeta',
      account: '',
      card: 'Nu Crédito',
      installments: 12,
      method: 'Tarjeta crédito',
    });
  });

  it('leaves the method empty for movements that are not spending', () => {
    const transfer = toExportRow({
      ...lunch,
      type: 'TRANSFER',
      category: null,
      toAccount: { name: 'Nequi' },
    });
    expect(transfer).toMatchObject({ type: 'Transferencia', toAccount: 'Nequi', method: '' });
    const disbursement = toExportRow({
      ...lunch,
      type: 'DEBT_DISBURSEMENT',
      category: null,
      debt: { name: 'Libre inversión' },
    });
    expect(disbursement).toMatchObject({ type: 'Desembolso', loan: 'Libre inversión', method: '' });
  });

  it('labels the seven types like the spec', () => {
    expect(Object.values(EXPORT_TYPE_LABELS)).toEqual([
      'Ingreso',
      'Gasto',
      'Transferencia',
      'Compra con tarjeta',
      'Pago de tarjeta',
      'Pago de préstamo',
      'Desembolso',
    ]);
  });
});

describe('guardFormula (spec Fase 3 §4)', () => {
  it('prefixes text that a spreadsheet would run as a formula', () => {
    expect(['=1+1', '+57 300', '-5', '@SUMA(A1)', '\tTab', '\rCR'].map(guardFormula)).toEqual([
      "'=1+1",
      "'+57 300",
      "'-5",
      "'@SUMA(A1)",
      "'\tTab",
      "'\rCR",
    ]);
  });

  it('leaves safe text untouched', () => {
    expect(['Almuerzo', '2026-10-07', '', ' =con espacio', 'a=b'].map(guardFormula)).toEqual([
      'Almuerzo',
      '2026-10-07',
      '',
      ' =con espacio',
      'a=b',
    ]);
  });
});
