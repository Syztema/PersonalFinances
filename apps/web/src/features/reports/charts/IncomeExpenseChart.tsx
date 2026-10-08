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
  NEGATIVE_COLOR,
  POSITIVE_COLOR,
  TOOLTIP_STYLE,
  tooltipMoney,
} from './chartTheme';

/** 1. Ingresos vs. gastos por mes: barras agrupadas en `positive` y `negative`. */
export function IncomeExpenseChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const data = report.months.map((m) => ({ month: m.month, income: m.income, expense: m.expense }));
  const empty = data.every((m) => m.income === 0 && m.expense === 0);
  const animate = isAnimated(printMode);
  return (
    <ChartCard
      title="Ingresos vs. gastos"
      table={{
        columns: ['Mes', 'Ingresos', 'Gastos'],
        rows: empty
          ? []
          : data.map((m) => [formatMonthYear(m.month), formatCOP(m.income), formatCOP(m.expense)]),
      }}
    >
      {empty ? (
        <ChartEmpty>Sin ingresos ni gastos en este periodo.</ChartEmpty>
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
                dataKey="income"
                name="Ingresos"
                fill={POSITIVE_COLOR}
                radius={4}
                isAnimationActive={animate}
              />
              <Bar
                dataKey="expense"
                name="Gastos"
                fill={NEGATIVE_COLOR}
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
