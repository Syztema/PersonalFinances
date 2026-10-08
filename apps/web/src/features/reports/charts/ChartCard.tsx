import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Card, CardTitle } from '../../../components/ui/Card';
import { cn } from '../../../lib/cn';
import { PRINT_WIDTH } from './chartTheme';

export interface ChartTable {
  columns: string[];
  rows: Array<Array<string>>;
}

/**
 * Tarjeta de un gráfico con "Ver tabla" (spec Fase 3 §5.1): la tabla muestra los mismos datos y es el
 * equivalente accesible, así que el dibujo queda `aria-hidden`. Sin filas, el contenido es el estado
 * vacío y sí se lee. `alwaysShowTable` deja la tabla abierta (categorías y cuentas al imprimir).
 */
export function ChartCard({
  title,
  table,
  children,
  alwaysShowTable = false,
}: {
  title: string;
  table: ChartTable;
  children: ReactNode;
  alwaysShowTable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const tableId = useId();
  const hasRows = table.rows.length > 0;
  const showTable = hasRows && (open || alwaysShowTable);
  return (
    <Card aria-labelledby={titleId} className="break-inside-avoid">
      <div className="flex items-center justify-between gap-2">
        <CardTitle id={titleId}>{title}</CardTitle>
        {hasRows && !alwaysShowTable && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? tableId : undefined}
            onClick={() => setOpen((value) => !value)}
            className="-my-2 inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-primary print:hidden"
          >
            {open ? 'Ocultar tabla' : 'Ver tabla'}
          </button>
        )}
      </div>
      <div className="mt-3" aria-hidden={hasRows || undefined}>
        {children}
      </div>
      {showTable && (
        <div id={tableId} className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                {table.columns.map((column, i) => (
                  <th
                    key={column}
                    scope="col"
                    className={cn('py-2 font-medium', i === 0 ? 'text-left' : 'pl-2 text-right')}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-b border-border last:border-0">
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="py-2 pr-2 text-left font-normal">
                        {cell}
                      </th>
                    ) : (
                      <td key={i} className="py-2 pl-2 text-right tabular-nums">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Estado vacío dentro de la tarjeta de un gráfico. */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

/**
 * En pantalla, el gráfico toma el ancho de la tarjeta; al imprimir, 680 px fijos (spec Fase 3 §5.3).
 * `children` recibe el tamaño que debe pasarle al gráfico de Recharts.
 */
export function ChartFrame({
  printMode,
  height,
  children,
}: {
  printMode: boolean;
  height: number;
  children: (size: { width?: number; height?: number }) => ReactElement;
}) {
  if (printMode) return children({ width: PRINT_WIDTH, height });
  return (
    <ResponsiveContainer width="100%" height={height}>
      {children({})}
    </ResponsiveContainer>
  );
}
