import { z } from 'zod';
import { AppError, notFound } from './errors';

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', fields);
}

const idParams = z.object({ id: z.uuid() });

/** `:id` de la ruta; un UUID mal formado responde 404 como cualquier recurso inexistente. */
export function parseId(params: unknown): string {
  const result = idParams.safeParse(params);
  if (!result.success) throw notFound('No encontrado.');
  return result.data.id;
}
