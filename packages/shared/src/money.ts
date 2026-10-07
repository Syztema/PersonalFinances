export const MAX_AMOUNT = 1_000_000_000_000;

function groupThousands(n: number): string {
  return Math.trunc(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** `$1.500.000` · `-$25.000` */
export function formatCOP(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${groupThousands(value)}`;
}

/** `$1,2 M` · `$850 mil` · `$500` (ejes y etiquetas de gráficos) */
export function formatCOPCompact(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000 || Math.round(abs / 1000) >= 1000) {
    const millions = Math.round((abs / 1_000_000) * 10) / 10;
    const text = Number.isInteger(millions)
      ? groupThousands(millions)
      : millions.toFixed(1).replace('.', ',');
    return `${sign}$${text} M`;
  }
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)} mil`;
  return formatCOP(value);
}

/** Interpreta texto escrito o pegado; descarta la parte decimal colombiana (después de la coma). */
export function parseCOP(input: string): number | null {
  const integerPart = input.split(',')[0] ?? '';
  const digits = integerPart.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}
