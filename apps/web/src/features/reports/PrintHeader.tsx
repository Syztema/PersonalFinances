import { DEFAULT_TIMEZONE, todayIn, type IsoDate } from '@finanzas/shared';
import { formatDate } from '../../lib/format';

const TIME = new Intl.DateTimeFormat('es-CO', {
  timeZone: DEFAULT_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Encabezado que solo aparece al imprimir (spec §5.3). `now` existe para las pruebas. */
export function PrintHeader({
  from,
  to,
  now = new Date(),
}: {
  from: IsoDate;
  to: IsoDate;
  now?: Date;
}) {
  return (
    <header className="hidden print:block">
      <p className="text-xl font-semibold">
        Finanzas — Reporte del {formatDate(from)} al {formatDate(to)}
      </p>
      <p className="text-sm text-muted">
        Generado el {formatDate(todayIn(DEFAULT_TIMEZONE, now))} a las {TIME.format(now)}
      </p>
    </header>
  );
}
