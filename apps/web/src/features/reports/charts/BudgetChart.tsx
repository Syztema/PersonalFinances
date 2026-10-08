import { formatCOP, type ReportDTO } from '@finanzas/shared';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonthYear } from '../../../lib/format';
import { ChartCard, ChartEmpty, ChartFrame } from './ChartCard';
import {
  AXIS_TICK,
  axisMoney,
  GRID_STROKE,
  isAnimated,
  monthTickFormatter,
  seriesColor,
  TOOLTIP_STYLE,
  tooltipMoney,
} from './chartTheme';

/** 8. Presupuesto vs. gasto por mes; los meses sin presupuesto muestran solo el gasto. */
export function BudgetChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const data = report.budget.months;
  const empty = data.every((m) => m.budget === null && m.spent === 0);
  const animate = isAnimated(printMode);
  return (
    <ChartCard
      title="Presupuesto vs. gasto"
      table={{
        columns: ['Mes', 'Presupuesto', 'Gastado'],
        rows: empty
          ? []
          : data.map((m) => [
              formatMonthYear(m.month),
              m.budget === null ? 'Sin presupuesto' : formatCOP(m.budget),
              formatCOP(m.spent),
            ]),
      }}
    >
      {empty ? (
        <ChartEmpty>Sin presupuesto ni gastos en este periodo.</ChartEmpty>
      ) : (
        <ChartFrame printMode={printMode} height={240}>
          {(size) => (
            <BarChart {...size} data={data} accessibilityLayer={false}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="month"
                tickFormatter={monthTickFormatter(report.period.months)}
                tick={AXIS_TICK}
                stroke={GRID_STROKE}
              />
              <YAxis tickFormatter={axisMoney} tick={AXIS_TICK} width={64} stroke={GRID_STROKE} />
              <Tooltip
                formatter={tooltipMoney}
                labelFormatter={(label) => formatMonthYear(String(label))}
                cursor={{ fill: 'var(--surface-2)' }}
                {...TOOLTIP_STYLE}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="budget"
                name="Presupuesto"
                fill={seriesColor(1)}
                radius={4}
                isAnimationActive={animate}
              />
              <Bar
                dataKey="spent"
                name="Gastado"
                fill={seriesColor(2)}
                radius={4}
                isAnimationActive={animate}
              />
            </BarChart>
          )}
        </ChartFrame>
      )}
    </ChartCard>
  );
}
