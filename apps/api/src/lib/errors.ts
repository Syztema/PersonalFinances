export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);
export const badRequest = (code: string, message: string, fields?: Record<string, string>) =>
  new AppError(400, code, message, fields);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooManyAttempts = () =>
  new AppError(
    429,
    'TOO_MANY_ATTEMPTS',
    'Demasiados intentos. Espera 15 minutos e intenta de nuevo.',
  );

/** Addendum §3.1: lo eliminado es de solo lectura hasta restaurarlo. */
export const entityDeleted = (name: string, action: string) =>
  conflict('ENTITY_DELETED', `Restaura "${name}" desde Eliminados para ${action}.`);

export function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002';
}
