import { isValidIsoDate, type IsoDate } from '@finanzas/shared';
import { badRequest } from '../../lib/errors';

export interface Cursor {
  date: IsoDate;
  createdAt: string;
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.date, cursor.createdAt, cursor.id])).toString(
    'base64url',
  );
}

export function decodeCursor(value: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 3) {
      const [date, createdAt, id] = parsed as [unknown, unknown, unknown];
      if (
        typeof date === 'string' &&
        isValidIsoDate(date) &&
        typeof createdAt === 'string' &&
        !Number.isNaN(Date.parse(createdAt)) &&
        typeof id === 'string' &&
        UUID_RE.test(id)
      ) {
        return { date, createdAt, id };
      }
    }
  } catch {
    // cae al error de abajo
  }
  throw badRequest('INVALID_CURSOR', 'La paginación no es válida. Vuelve a cargar la lista.');
}
