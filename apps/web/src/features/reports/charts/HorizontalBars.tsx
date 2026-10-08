import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame } from './ChartCard';
import {
  AXIS_TICK,
  axisMoney,
  GRID_STROKE,
  isAnimated,
  TOOLTIP_STYLE,
  tooltipMoney,
  zeroInclusiveDomain,
} from './chartTheme';

export interface BarRow {
  name: string;
  value: number;
  color: string;
}

const shortName = (name: string) => (name.length > 14 ? `${name.slice(0, 13)}…` : name);

/** Barras horizontales (spec Fase 3 §5.1: categorías, métodos de pago, cuentas y tarjetas; sin tortas). */
export function HorizontalBars({ rows, printMode }: { rows: BarRow[]; printMode: boolean }) {
  const animate = isAnimated(printMode);
  const hasNegative = rows.some((row) => row.value < 0);
  return (
    <ChartFrame printMode={printMode} height={Math.max(120, rows.length * 40 + 40)}>
      {(size) => (
        <BarChart
          {...size}
          data={rows}
          layout="vertical"
          accessibilityLayer={false}
          margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        >
          <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
          <XAxis
            type="number"
            domain={zeroInclusiveDomain}
            tickFormatter={axisMoney}
            tick={AXIS_TICK}
            stroke={GRID_STROKE}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={112}
            tickFormatter={shortName}
            tick={AXIS_TICK}
            stroke={GRID_STROKE}
          />
          <Tooltip
            formatter={tooltipMoney}
            cursor={{ fill: 'var(--surface-2)' }}
            {...TOOLTIP_STYLE}
          />
          {hasNegative && <ReferenceLine x={0} stroke="var(--muted)" />}
          <Bar dataKey="value" name="Valor" radius={4} isAnimationActive={animate}>
            {rows.map((row, i) => (
              <Cell key={`${i}-${row.name}`} fill={row.color} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartFrame>
  );
}
