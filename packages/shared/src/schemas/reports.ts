import { z } from 'zod';
import { REPORT_PRESETS, type ReportPeriodInput, type ReportPreset } from '../reports';
import { zIsoDate } from './common';

const periodFields = {
  preset: z.enum(REPORT_PRESETS).optional(),
  from: zIsoDate.optional(),
  to: zIsoDate.optional(),
};

interface PeriodQuery {
  preset?: ReportPreset;
  from?: string;
  to?: string;
}

/** Se envía `preset` solo, o `from` y `to` juntos (spec Fase 3 §3.1). */
const oneMode = (q: PeriodQuery) =>
  q.preset !== undefined
    ? q.from === undefined && q.to === undefined
    : q.from !== undefined && q.to !== undefined;
const oneModeIssue = { path: ['preset'], message: 'Elige un periodo' };

/** `GET /api/reports`. */
export const reportQuerySchema = z.strictObject(periodFields).refine(oneMode, oneModeIssue);

/** `GET /api/reports/export`: el mismo periodo más el formato (spec Fase 3 §4). */
export const reportExportQuerySchema = z
  .strictObject({ ...periodFields, format: z.enum(['csv', 'xlsx']) })
  .refine(oneMode, oneModeIssue);

export type ReportQuery = z.output<typeof reportQuerySchema>;
export type ReportExportQuery = z.output<typeof reportExportQuerySchema>;
export type ExportFormat = ReportExportQuery['format'];

/** Consulta ya validada → entrada de `resolveReportPeriod`. */
export function periodInputOf(q: PeriodQuery): ReportPeriodInput {
  return q.preset ? { preset: q.preset } : { from: q.from!, to: q.to! };
}
