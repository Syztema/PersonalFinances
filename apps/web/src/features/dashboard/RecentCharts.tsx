import type { ReportDTO } from '@finanzas/shared';
import { CategoryBarsChart } from '../reports/charts/CategoryBarsChart';
import { CompanionBarsChart } from '../reports/charts/CompanionBarsChart';
import { CompanionMonthsChart } from '../reports/charts/CompanionMonthsChart';
import { IncomeExpenseChart } from '../reports/charts/IncomeExpenseChart';
import { SavingsChart } from '../reports/charts/SavingsChart';

/** Chunk diferido del dashboard (spec §5.2 y con quién): solo se descarga cuando la sección entra en pantalla. */
export default function RecentCharts({ report }: { report: ReportDTO }) {
  return (
    <div className="space-y-4">
      <IncomeExpenseChart report={report} />
      <CategoryBarsChart report={report} />
      <CompanionBarsChart report={report} />
      <CompanionMonthsChart report={report} />
      <SavingsChart report={report} />
    </div>
  );
}
