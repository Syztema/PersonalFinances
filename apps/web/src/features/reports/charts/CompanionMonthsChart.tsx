import { formatCOP, groupCompanionSeries, type ReportDTO } from '@finanzas/shared';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonthYear } from '../../../lib/format';
import { ChartCard, ChartEmpty, ChartFrame } from './ChartCard';
import {
  AXIS_TICK,
  axisMoney,
  GRID_STROKE,
  isAnimated,
  monthTickFormatter,
  TOOLTIP_STYLE,
  tooltipMoney,
} from './chartTheme';
import { EMPTY_WHO, hasWho, seriesFill, seriesLabel } from './companionSeries';

/** Con quién gastas, mes a mes (spec con quién §4.3): barras apiladas con las series de §4.2. */
export function CompanionMonthsChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const { series, months } = groupCompanionSeries(
    report.expenseByCompanion,
    report.companionMonths,
  );
  const empty = !hasWho(series);
  const animate = isAnimated(printMode);
  const data = months.map((m) => ({ month: m.month, ...m.values }));
  return (
    <ChartCard
      title="Con quién gastas, mes a mes"
      table={{
        columns: ['Mes', ...series.map(seriesLabel)],
        rows: empty
          ? []
          : months.map((m) => [
              formatMonthYear(m.month),
              ...series.map((s) => formatCOP(m.values[s.key] ?? 0)),
            ]),
      }}
    >
      {empty ? (
        <ChartEmpty>{EMPTY_WHO}</ChartEmpty>
      ) : (
        <ChartFrame printMode={printMode} height={260}>
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
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={seriesLabel(s)}
                  stackId="who"
                  fill={seriesFill(s, i)}
                  isAnimationActive={animate}
                />
              ))}
            </BarChart>
          )}
        </ChartFrame>
      )}
    </ChartCard>
  );
}
