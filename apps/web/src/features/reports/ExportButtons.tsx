import type { ExportFormat, ReportPeriodInput } from '@finanzas/shared';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { ApiError } from '../../lib/api';
import { downloadReport } from '../../lib/download';

/** Spec Fase 3 §5.1: acciones al final de Reportes; `disabled` mientras lo que se ve no es el periodo elegido. */
export function ExportButtons({
  period,
  disabled,
  onPrint,
}: {
  period: ReportPeriodInput;
  disabled: boolean;
  onPrint: () => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 print:hidden">
      <ExportButton format="csv" period={period} disabled={disabled} icon={<FileText size={18} />}>
        Exportar CSV
      </ExportButton>
      <ExportButton
        format="xlsx"
        period={period}
        disabled={disabled}
        icon={<FileSpreadsheet size={18} />}
      >
        Exportar Excel
      </ExportButton>
      {/* Imprimir no necesita red. */}
      <Button variant="secondary" disabled={disabled} onClick={onPrint}>
        <Printer size={18} aria-hidden /> Imprimir o guardar PDF
      </Button>
    </div>
  );
}

/** Cada botón tiene su propia guardia y su propio estado: un doble toque nunca pide dos archivos. */
function ExportButton({
  format,
  period,
  disabled,
  icon,
  children,
}: {
  format: ExportFormat;
  period: ReportPeriodInput;
  disabled: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  const toast = useToast();
  const inFlight = useRef(false);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      await downloadReport(format, period);
    } catch (err) {
      toast.show({
        message: err instanceof ApiError ? err.message : 'No pudimos descargar el archivo.',
        tone: 'error',
      });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };
  return (
    <Button
      variant="secondary"
      requiresNetwork
      loading={loading}
      disabled={disabled}
      onClick={() => void run()}
    >
      {!loading && <span aria-hidden>{icon}</span>}
      {children}
    </Button>
  );
}
