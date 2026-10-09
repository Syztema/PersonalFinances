import type { CompanionSeries } from '@finanzas/shared';
import { refName } from '../../../lib/refs';
import { OTHER_COLOR, seriesColor } from './chartTheme';

/** Decisión B1: "Sin indicar" se distingue de "Otros" en las barras apiladas. */
export const UNSET_COLOR = 'var(--muted)';

export const EMPTY_WHO = 'Aún no has indicado con quién gastas.';

export const seriesLabel = (s: CompanionSeries): string =>
  s.key === 'other' ? 'Otros' : s.key === 'none' ? 'Sin indicar' : (refName(s.companion) ?? '');

/** Las compañías van primero, así `i` es su puesto y tienen el mismo color en las dos gráficas. */
export const seriesFill = (s: CompanionSeries, i: number): string =>
  s.key === 'other' ? OTHER_COLOR : s.key === 'none' ? UNSET_COLOR : seriesColor(i);

/** Decisión B9: sin gastos con compañía en el periodo, las dos gráficas muestran el estado vacío. */
export const hasWho = (series: CompanionSeries[]): boolean =>
  series.some((s) => s.companion !== null);
