import type { ReportDTO } from '@finanzas/shared';
import { AccountsChart } from './AccountsChart';
import { BudgetChart } from './BudgetChart';
import { CardDebtChart } from './CardDebtChart';
import { CategoryBarsChart } from './CategoryBarsChart';
import { IncomeExpenseChart } from './IncomeExpenseChart';
import { NetWorthChart } from './NetWorthChart';
import { PaymentMethodChart } from './PaymentMethodChart';
import { SavingsChart } from './SavingsChart';

/** Los 8 gráficos del reporte (spec Fase 3 §5.1). Chunk diferido: ReportsPage lo carga con React.lazy. */
export default function ReportCharts({
  report,
  printMode,
}: {
  report: ReportDTO;
  printMode: boolean;
}) {
  return (
    <div className="space-y-4">
      <IncomeExpenseChart report={report} printMode={printMode} />
      <CategoryBarsChart report={report} printMode={printMode} />
      <PaymentMethodChart report={report} printMode={printMode} />
      <AccountsChart report={report} printMode={printMode} />
      <CardDebtChart report={report} printMode={printMode} />
      <SavingsChart report={report} printMode={printMode} />
      <NetWorthChart report={report} printMode={printMode} />
      <BudgetChart report={report} printMode={printMode} />
    </div>
  );
}
