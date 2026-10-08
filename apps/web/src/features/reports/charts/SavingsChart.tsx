import { formatCOP, type ReportDTO } from '@finanzas/shared';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
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
  zeroInclusiveDomain,
} from './chartTheme';

/** 6. Evolución del ahorro: saldo de las cuentas de ahorro e inversión al cierre de cada mes. */
export function SavingsChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const data = report.months.map((m) => ({ month: m.month, savings: m.closing.savingsBalance }));
  const empty = data.every((m) => m.savings === 0);
  return (
    <ChartCard
      title="Evolución del ahorro"
      table={{
        columns: ['Mes', 'Ahorro e inversión'],
        rows: empty ? [] : data.map((m) => [formatMonthYear(m.month), formatCOP(m.savings)]),
      }}
    >
      {empty ? (
        <ChartEmpty>Aún no tienes dinero en cuentas de ahorro o inversión.</ChartEmpty>
      ) : (
        <ChartFrame printMode={printMode} height={220}>
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
              <Line
                type="monotone"
                dataKey="savings"
                name="Ahorro e inversión"
                stroke={seriesColor(0)}
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={isAnimated(printMode)}
              />
            </LineChart>
          )}
        </ChartFrame>
      )}
    </ChartCard>
  );
}
