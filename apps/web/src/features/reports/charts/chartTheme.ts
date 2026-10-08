import { formatCOP, formatCOPCompact } from '@finanzas/shared';
import type { CSSProperties } from 'react';
import { formatMonthYear } from '../../../lib/format';

/** Spec Fase 3 §5.1: series `--chart-1` a `--chart-6` (siguen al tema; al imprimir, los claros). */
export const seriesColor = (i: number): string => `var(--chart-${(i % 6) + 1})`;
export const OTHER_COLOR = 'var(--chart-other)';
export const POSITIVE_COLOR = 'var(--positive)';
export const NEGATIVE_COLOR = 'var(--negative)';

/** Ejes: "$1,2 M", "$850 mil". */
export const axisMoney = formatCOPCompact;
/** Al tocar: el valor exacto, "$1.234.567". */
export const tooltipMoney = (value: unknown): string => formatCOP(Number(value));

/** Proporción con un decimal: 0.4651 → "46,5 %". */
export const formatShare = (share: number): string =>
  `${(Math.round(share * 1000) / 10).toFixed(1).replace('.', ',')} %`;

/** Eje de meses: "oct" o, si el periodo cruza de año, "oct 25". */
export function monthTickFormatter(months: readonly string[]): (key: string) => string {
  const manyYears = new Set(months.map((m) => m.slice(0, 4))).size > 1;
  return (key) => `${formatMonthYear(key).slice(0, 3)}${manyYears ? ` ${key.slice(2, 4)}` : ''}`;
}

/** Spec Fase 3 §5.3: al imprimir, ancho fijo. */
export const PRINT_WIDTH = 680;

/** Sin animación al imprimir ni con `prefers-reduced-motion` (spec Fase 3 §5.1 y §7.1). */
export function isAnimated(printMode: boolean): boolean {
  if (printMode) return false;
  return !(
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export const AXIS_TICK = { fill: 'var(--muted)', fontSize: 12 };
export const GRID_STROKE = 'var(--border)';

/** Tooltip con los colores del tema (el de Recharts es blanco fijo). */
export const TOOLTIP_STYLE: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
} = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    fontSize: 13,
  },
  labelStyle: { color: 'var(--fg)', fontWeight: 600 },
  itemStyle: { color: 'var(--fg)' },
};

/** Dominio del eje de valores que siempre incluye el 0 y los negativos de los datos (sobregiros, patrimonio negativo). */
export const zeroInclusiveDomain: [(dataMin: number) => number, (dataMax: number) => number] = [
  (dataMin) => Math.min(0, dataMin),
  (dataMax) => Math.max(0, dataMax),
];
