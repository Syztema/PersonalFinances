import { EXPORT_COLUMNS, guardFormula, type ExportRow } from './rows';

/** Marca de orden de bytes: Excel abre el archivo como UTF-8 (tildes y emojis). */
export const BOM = String.fromCharCode(0xfeff);
const NEEDS_QUOTES = /[;"\r\n]/;

/** Un campo: protegido contra fórmulas y, si lleva `;`, `"`, CR o LF, entre comillas (RFC 4180). */
export function csvField(value: string): string {
  const text = guardFormula(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (fields: string[]) => `${fields.map(csvField).join(';')}\r\n`;

/** Spec Fase 3 §4: UTF-8 con BOM, separador `;`, fin de línea CRLF y la fecha como AAAA-MM-DD. */
export function toCsv(rows: ExportRow[]): string {
  let out = BOM + csvLine([...EXPORT_COLUMNS]);
  for (const r of rows) {
    out += csvLine([
      r.date,
      r.type,
      r.description,
      r.category,
      r.subcategory,
      r.companion,
      r.account,
      r.toAccount,
      r.card,
      r.loan,
      r.installments === null ? '' : String(r.installments),
      r.method,
      String(r.amount),
      r.tags,
      r.notes,
    ]);
  }
  return out;
}
