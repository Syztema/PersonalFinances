import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { CategoryRefDTO } from '@finanzas/shared';
import type { ReportBody } from '../../../domain/report';
import type { ExportRow } from './rows';
import { formatGeneratedAt, toXlsx } from './xlsx';

const category = (name: string, kind: 'INCOME' | 'EXPENSE'): CategoryRefDTO => ({
  id: name,
  name,
  kind,
  parentId: null,
  icon: 'tag',
  color: '#64748b',
  isActive: true,
});

const report: ReportBody = {
  period: { preset: null, from: '2026-10-01', to: '2026-10-20', months: ['2026-10'] },
  totals: {
    income: 4_000_000,
    expense: 1_325_000,
    savings: 0,
    investment: 0,
    remaining: 2_675_000,
    savingsRate: 0,
  },
  expenseByCategory: [
    { category: category('Entretenimiento', 'EXPENSE'), amount: 1_200_000, share: 0.9057 },
    { category: category('=Peligrosa', 'EXPENSE'), amount: 125_000, share: 0.0943 },
  ],
  incomeByCategory: [{ category: category('Salario', 'INCOME'), amount: 4_000_000, share: 1 }],
  accounts: [
    {
      account: {
        id: 'bank',
        name: 'Bancolombia',
        type: 'BANK',
        icon: 'wallet',
        color: '#0f766e',
        isActive: true,
      },
      opening: 2_000_000,
      inflow: 4_000_000,
      outflow: 45_000,
      closing: 5_955_000,
    },
  ],
  cards: [],
  paymentMethods: [],
  months: [],
};

const rows: ExportRow[] = [
  {
    date: '2026-10-07',
    type: 'Gasto',
    description: 'Almuerzo; "especial"\ncon postre 🍕',
    category: 'Alimentación',
    subcategory: '',
    account: 'Bancolombia',
    toAccount: '',
    card: '',
    loan: '',
    installments: null,
    method: 'Tarjeta débito',
    amount: 45_000,
    tags: 'comida, trabajo',
    notes: '=HYPERLINK("http://x")',
  },
];

async function read(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  // exceljs tipa la entrada como ArrayBuffer: se copia el Buffer de Node a uno propio.
  await wb.xlsx.load(new Uint8Array(buffer).buffer);
  return wb;
}

/** Valores de una fila desde la columna A (sin el hueco del índice 0 de exceljs). */
const values = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1);

describe('toXlsx (spec Fase 3 §4)', () => {
  it('writes the four sheets with the summary, the movements and the breakdowns', async () => {
    const wb = await read(await toXlsx(report, rows, '20/10/2026 10:00'));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Resumen',
      'Movimientos',
      'Por categoría',
      'Por cuenta',
    ]);

    const summary = wb.getWorksheet('Resumen')!;
    expect(values(summary, 1)).toEqual(['Periodo', 'Personalizado']);
    expect(values(summary, 5)).toEqual(['Ingresos', 4_000_000]);
    expect(summary.getCell('B5').numFmt).toBe('"$"#,##0');
    expect(values(summary, 10)).toEqual(['Tasa de ahorro', 0]);
    expect(summary.getCell('B10').numFmt).toBe('0.0%');
    expect(values(summary, 12)).toEqual(['Generado el', '20/10/2026 10:00']);

    const movements = wb.getWorksheet('Movimientos')!;
    expect(values(movements, 1)).toEqual([
      'Fecha',
      'Tipo',
      'Descripción',
      'Categoría',
      'Subcategoría',
      'Cuenta',
      'Cuenta destino',
      'Tarjeta',
      'Préstamo',
      'Cuotas',
      'Método de pago',
      'Valor',
      'Etiquetas',
      'Notas',
    ]);
    expect(movements.getRow(1).font?.bold).toBe(true);
    expect(movements.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(movements.autoFilter).toBe('A1:N1');
    const data = movements.getRow(2);
    expect(data.getCell(3).value).toBe('Almuerzo; "especial"\ncon postre 🍕');
    expect(data.getCell(14).value).toBe('\'=HYPERLINK("http://x")');
    expect(data.getCell(12).value).toBe(45_000);
    expect(data.getCell(12).numFmt).toBe('"$"#,##0');

    const byCategory = wb.getWorksheet('Por categoría')!;
    expect(values(byCategory, 1)).toEqual(['Gastos']);
    expect(values(byCategory, 2)).toEqual(['Categoría', 'Valor', 'Porcentaje']);
    expect(values(byCategory, 3)).toEqual(['Entretenimiento', 1_200_000, 0.9057]);
    expect(values(byCategory, 4)).toEqual(["'=Peligrosa", 125_000, 0.0943]);
    expect(byCategory.getCell('C3').numFmt).toBe('0.0%');
    expect(values(byCategory, 6)).toEqual(['Ingresos']);
    expect(values(byCategory, 8)).toEqual(['Salario', 4_000_000, 1]);

    const byAccount = wb.getWorksheet('Por cuenta')!;
    expect(values(byAccount, 1)).toEqual([
      'Cuenta',
      'Tipo',
      'Saldo inicial',
      'Entradas',
      'Salidas',
      'Saldo final',
    ]);
    expect(values(byAccount, 2)).toEqual([
      'Bancolombia',
      'Cuenta bancaria',
      2_000_000,
      4_000_000,
      45_000,
      5_955_000,
    ]);
  });

  it('writes dates as real UTC-midnight dates so no time zone moves the day (review focus 4)', async () => {
    const original = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati'; // UTC+14: una fecha local se correría al día anterior
    try {
      const wb = await read(await toXlsx(report, rows, '20/10/2026 10:00'));
      const cell = wb.getWorksheet('Movimientos')!.getCell('A2');
      expect(cell.numFmt).toBe('dd/mm/yyyy');
      expect(cell.value).toBeInstanceOf(Date);
      expect((cell.value as Date).toISOString()).toBe('2026-10-07T00:00:00.000Z');
      const from = wb.getWorksheet('Resumen')!.getCell('B2').value as Date;
      expect(from.toISOString().slice(0, 10)).toBe('2026-10-01');
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('formatGeneratedAt', () => {
  it('uses the Bogotá date and a 24-hour clock', () => {
    expect(formatGeneratedAt(new Date('2026-10-20T15:00:00Z'), 'America/Bogota')).toBe(
      '20/10/2026 10:00',
    );
    expect(formatGeneratedAt(new Date('2026-11-01T04:30:00Z'), 'America/Bogota')).toBe(
      '31/10/2026 23:30',
    );
    expect(formatGeneratedAt(new Date('2026-10-21T05:05:00Z'), 'America/Bogota')).toBe(
      '21/10/2026 00:05',
    );
  });
});
