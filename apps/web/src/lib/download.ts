import type { ExportFormat, ReportPeriodInput } from '@finanzas/shared';
import { apiErrorFrom, networkError } from './api';
import { reportParams } from './queries';

const EXPORT_PATH = '/reports/export';
const FALLBACK_NAME: Record<ExportFormat, string> = {
  csv: 'finanzas-movimientos.csv',
  xlsx: 'finanzas-reporte.xlsx',
};
/** Safari necesita la URL del archivo viva un momento después del clic. */
export const REVOKE_DELAY_MS = 10_000;

/** Parámetros de la exportación: van solo en la petición a la API, nunca en la URL del navegador. */
export function exportQuery(format: ExportFormat, period: ReportPeriodInput): string {
  return `${new URLSearchParams({ format })}&${reportParams(period)}`;
}

/** Nombre del archivo desde `Content-Disposition: attachment; filename="…"`. */
export function filenameFrom(disposition: string | null, format: ExportFormat): string {
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? FALLBACK_NAME[format];
}

/** Spec Fase 3 §4: pide el archivo con `fetch` y lo descarga con un enlace temporal; la página no navega. */
export async function downloadReport(
  format: ExportFormat,
  period: ReportPeriodInput,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api${EXPORT_PATH}?${exportQuery(format, period)}`, {
      credentials: 'same-origin',
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw await apiErrorFrom(res, EXPORT_PATH);
  const blob = await res.blob().catch(() => {
    throw networkError();
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFrom(res.headers.get('content-disposition'), format);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
