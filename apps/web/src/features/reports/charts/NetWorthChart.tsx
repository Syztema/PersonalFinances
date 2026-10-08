import { formatCOP, type ReportDTO } from '@finanzas/shared';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMonthYear } from '../../../lib/format';
import { ChartCard, ChartEmpty, ChartFrame } from './ChartCard';
import {
  AXIS_TICK,
  axisMoney,
  GRID_STROKE,
  isAnimated,
  monthTickFormatter,
  NEGATIVE_COLOR,
  seriesColor,
  TOOLTIP_STYLE,
  tooltipMoney,
  zeroInclusiveDomain,
} from './chartTheme';

const SERIES = [
  { key: 'totalMoney', name: 'Dinero total', color: seriesColor(0) },
  { key: 'debts', name: 'Deudas', color: NEGATIVE_COLOR },
  { key: 'netWorth', name: 'Patrimonio neto', color: seriesColor(1) },
] as const;

/** 7. Evolución mensual: dinero total, deudas y patrimonio neto al cierre de cada mes. */
export function NetWorthChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const data = report.months.map((m) => ({ month: m.month, ...m.closing }));
  const empty = data.every((m) => m.totalMoney === 0 && m.debts === 0 && m.netWorth === 0);
  const animate = isAnimated(printMode);
  return (
    <ChartCard
      title="Evolución mensual"
      table={{
        columns: ['Mes', 'Dinero total', 'Deudas', 'Patrimonio neto'],
        rows: empty
          ? []
          : data.map((m) => [
              formatMonthYear(m.month),
              formatCOP(m.totalMoney),
              formatCOP(m.debts),
              formatCOP(m.netWorth),
            ]),
      }}
    >
      {empty ? (
        <ChartEmpty>Sin saldos ni deudas en este periodo.</ChartEmpty>
      ) : (
        <ChartFrame printMode={printMode} height={240}>
          {(size) => (
            <LineChart {...size} data={data} accessibilityLayer={false}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="month"
                tickFormatter={monthTickFormatter(report.period.months)}
                tick={AXIS_TICK}
                stroke={GRID_STROKE}
              />
              <YAxis
                domain={zeroInclusiveDomain}
                tickFormatter={axisMoney}
                tick={AXIS_TICK}
                width={64}
                stroke={GRID_STROKE}
              />
              <Tooltip
                formatter={tooltipMoney}
                labelFormatter={(label) => formatMonthYear(String(label))}
                {...TOOLTIP_STYLE}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {data.some((m) => m.netWorth < 0) && <ReferenceLine y={0} stroke="var(--muted)" />}
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={animate}
                />
              ))}
            </LineChart>
          )}
        </ChartFrame>
      )}
    </ChartCard>
  );
}
