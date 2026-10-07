import type { ApiError } from './api';

/** Errores del servidor por campo; si ninguno se muestra en el formulario, agrega el mensaje general. */
export function toFormErrors(error: ApiError, rendered: string[]): Record<string, string> {
  const fields = error.fields ?? {};
  const visible = Object.keys(fields).some((k) => rendered.includes(k));
  return visible ? fields : { ...fields, _: error.message };
}
