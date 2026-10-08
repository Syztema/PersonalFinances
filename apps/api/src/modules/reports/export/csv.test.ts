import { describe, expect, it } from 'vitest';
import { BOM, csvField, toCsv } from './csv';
import type { ExportRow } from './rows';

const HEADER =
  'Fecha;Tipo;Descripción;Categoría;Subcategoría;Cuenta;Cuenta destino;Tarjeta;Préstamo;Cuotas;Método de pago;Valor;Etiquetas;Notas\r\n';

const row: ExportRow = {
  date: '2026-10-07',
  type: 'Gasto',
  description: 'Almuerzo; "especial"',
  category: 'Alimentación',
  subcategory: 'Restaurantes',
  account: 'Bancolombia',
  toAccount: '',
  card: '',
  loan: '',
  installments: null,
  method: 'Tarjeta débito',
  amount: 45_000,
  tags: 'comida, trabajo',
  notes: '=1+1',
};

describe('csvField (RFC 4180 with ;)', () => {
  it('quotes fields with ; " CR or LF and doubles the quotes', () => {
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('dice "hola"')).toBe('"dice ""hola"""');
    expect(csvField('línea\notra')).toBe('"línea\notra"');
    expect(csvField('a\r\nb')).toBe('"a\r\nb"');
    expect(csvField('Café con 🍕, sin comillas')).toBe('Café con 🍕, sin comillas');
  });

  it('neutralizes formulas before quoting', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('\rCR')).toBe(`"'\rCR"`);
    expect(csvField('@nota')).toBe("'@nota");
  });
});

describe('toCsv (spec Fase 3 §4)', () => {
  it('writes the BOM, the header, ; separators and CRLF line ends', () => {
    expect(toCsv([row])).toBe(
      BOM +
        HEADER +
        '2026-10-07;Gasto;"Almuerzo; ""especial""";Alimentación;Restaurantes;Bancolombia;;;;;' +
        "Tarjeta débito;45000;comida, trabajo;'=1+1\r\n",
    );
  });

  it('writes the installments of a card purchase as a number', () => {
    const csv = toCsv([
      { ...row, type: 'Compra con tarjeta', description: 'TV', installments: 12 },
    ]);
    expect(csv.split('\r\n')[1]?.split(';')[9]).toBe('12');
  });

  it('writes only the header when there are no movements', () => {
    expect(toCsv([])).toBe(BOM + HEADER);
  });
});
