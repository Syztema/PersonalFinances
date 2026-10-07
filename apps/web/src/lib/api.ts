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
    throw new ApiError(0, 'NETWORK', 'Sin conexión. Revisa tu internet e intenta de nuevo.');
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    const apiError = new ApiError(
      res.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Ocurrió un error inesperado.',
      error?.fields,
    );
    if (res.status === 401 && !SILENT_401.has(path)) unauthorizedListener?.(apiError.code);
    throw apiError;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: (path: string) => request<void>('DELETE', path),
};
