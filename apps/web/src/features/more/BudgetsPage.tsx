import { ChartPie } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';

export function BudgetsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Presupuestos</h1>
      <EmptyState
        icon={<ChartPie />}
        title="Los presupuestos llegan en la próxima actualización"
        description="Podrás definir un presupuesto general y por categoría, con alertas al 50, 75, 90 y 100 %."
      />
    </div>
  );
}
