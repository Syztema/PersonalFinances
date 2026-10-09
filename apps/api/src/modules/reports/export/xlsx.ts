import ExcelJS from 'exceljs';
import { ACCOUNT_TYPE_LABELS, REPORT_PRESET_LABELS, type IsoDate } from '@finanzas/shared';
import type { ReportBody } from '../../../domain/report';
import { toDbDate } from '../../../lib/db';
import { EXPORT_COLUMNS, guardFormula, type ExportRow } from './rows';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MONEY = '"$"#,##0';
const DATE = 'dd/mm/yyyy';
/** Se ve como `0,0 %` en un Excel en español (el código de formato siempre usa punto). */
const PERCENT = '0.0%';
const COLUMN_WIDTHS = [12, 18, 32, 20, 20, 18, 20, 20, 18, 18, 8, 18, 14, 24, 32];

/** Fecha calendario como fecha real a medianoche UTC: no se corre de día en ninguna zona. */
const dateCell = (iso: IsoDate) => toDbDate(iso);
/** Texto del usuario: vacío → celda vacía; si no, protegido contra fórmulas. */
const text = (value: string) => (value === '' ? null : guardFormula(value));

/** "Generado el" en la zona del usuario: `dd/mm/aaaa hh:mm` (24 h). */
export function formatGeneratedAt(now: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/** Spec Fase 3 §4 y con quién §4.4: Resumen, Movimientos, Por categoría, Por compañía y Por cuenta. */
export async function toXlsx(
  report: ReportBody,
  rows: ExportRow[],
  generatedAt: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Finanzas';

  const summary = wb.addWorksheet('Resumen');
  summary.columns = [{ width: 18 }, { width: 22 }];
  const { period, totals } = report;
  summary.addRow([
    'Periodo',
    period.preset ? REPORT_PRESET_LABELS[period.preset] : 'Personalizado',
  ]);
  summary.addRow(['Desde', dateCell(period.from)]).getCell(2).numFmt = DATE;
  summary.addRow(['Hasta', dateCell(period.to)]).getCell(2).numFmt = DATE;
  summary.addRow([]);
  const money: Array<[string, number]> = [
    ['Ingresos', totals.income],
    ['Gastos', totals.expense],
    ['Ahorro', totals.savings],
    ['Inversión', totals.investment],
    ['Restante', totals.remaining],
  ];
  for (const [label, value] of money) summary.addRow([label, value]).getCell(2).numFmt = MONEY;
  summary.addRow(['Tasa de ahorro', totals.savingsRate]).getCell(2).numFmt = PERCENT;
  summary.addRow([]);
  summary.addRow(['Generado el', generatedAt]);
  summary.getColumn(1).font = { bold: true };

  const movements = wb.addWorksheet('Movimientos');
  movements.columns = EXPORT_COLUMNS.map((header, i) => ({ header, width: COLUMN_WIDTHS[i] }));
  movements.getRow(1).font = { bold: true };
  movements.views = [{ state: 'frozen', ySplit: 1 }];
  movements.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXPORT_COLUMNS.length },
  };
  for (const r of rows) {
    const row = movements.addRow([
      dateCell(r.date),
      text(r.type),
      text(r.description),
      text(r.category),
      text(r.subcategory),
      text(r.companion),
      text(r.account),
      text(r.toAccount),
      text(r.card),
      text(r.loan),
      r.installments,
      text(r.method),
      r.amount,
      text(r.tags),
      text(r.notes),
    ]);
    row.getCell(1).numFmt = DATE;
    row.getCell(13).numFmt = MONEY;
  }

  const byCategory = wb.addWorksheet('Por categoría');
  byCategory.columns = [{ width: 28 }, { width: 16 }, { width: 12 }];
  const block = (title: string, items: ReportBody['expenseByCategory']) => {
    byCategory.addRow([title]).font = { bold: true };
    byCategory.addRow(['Categoría', 'Valor', 'Porcentaje']).font = { bold: true };
    for (const item of items) {
      const row = byCategory.addRow([text(item.category.name), item.amount, item.share]);
      row.getCell(2).numFmt = MONEY;
      row.getCell(3).numFmt = PERCENT;
    }
  };
  block('Gastos', report.expenseByCategory);
  byCategory.addRow([]);
  block('Ingresos', report.incomeByCategory);

  const byCompanion = wb.addWorksheet('Por compañía');
  byCompanion.columns = ['Con quién', 'Valor', 'Porcentaje'].map((header, i) => ({
    header,
    width: [28, 16, 12][i],
  }));
  byCompanion.getRow(1).font = { bold: true };
  for (const item of report.expenseByCompanion) {
    const row = byCompanion.addRow([
      item.companion ? text(item.companion.name) : 'Sin indicar',
      item.amount,
      item.share,
    ]);
    row.getCell(2).numFmt = MONEY;
    row.getCell(3).numFmt = PERCENT;
  }

  const byAccount = wb.addWorksheet('Por cuenta');
  byAccount.columns = ['Cuenta', 'Tipo', 'Saldo inicial', 'Entradas', 'Salidas', 'Saldo final'].map(
    (header, i) => ({ header, width: i < 2 ? 24 : 16 }),
  );
  byAccount.getRow(1).font = { bold: true };
  for (const a of report.accounts) {
    const row = byAccount.addRow([
      text(a.account.name),
      ACCOUNT_TYPE_LABELS[a.account.type],
      a.opening,
      a.inflow,
      a.outflow,
      a.closing,
    ]);
    for (const col of [3, 4, 5, 6]) row.getCell(col).numFmt = MONEY;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
