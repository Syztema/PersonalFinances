import type { ApiErrorBody } from '@finanzas/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type UnauthorizedListener = (code: string) => void;
let unauthorizedListener: UnauthorizedListener | null = null;

/** Se llama cuando la sesión deja de ser válida durante el uso (no en login ni en la consulta inicial). */
export function onUnauthorized(listener: UnauthorizedListener) {
  unauthorizedListener = listener;
  return () => {
    if (unauthorizedListener === listener) unauthorizedListener = null;
  };
}

const SILENT_401 = new Set(['/auth/login', '/auth/me', '/auth/logout']);

/** Error de red (sin respuesta del servidor), con el mismo mensaje en toda la app. */
export const networkError = () =>
  new ApiError(0, 'NETWORK', 'Sin conexión. Revisa tu internet e intenta de nuevo.');

/** Convierte una respuesta de error en `ApiError` y avisa si la sesión dejó de ser válida. */
export async function apiErrorFrom(res: Response, path: string): Promise<ApiError> {
  const data: unknown = await res.json().catch(() => null);
  const error = (data as ApiErrorBody | null)?.error;
  const apiError = new ApiError(
    res.status,
    error?.code ?? 'UNKNOWN',
    error?.message ?? 'Ocurrió un error inesperado.',
    error?.fields,
  );
  if (res.status === 401 && !SILENT_401.has(path)) unauthorizedListener?.(apiError.code);
  return apiError;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      ...(body !== undefined && {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
  } catch {
    throw networkError();
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await apiErrorFrom(res, path);
  return (await res.json().catch(() => null)) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T = void>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
