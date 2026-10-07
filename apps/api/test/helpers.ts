import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp, type AppDeps } from '../src/app';
import { loadConfig } from '../src/config/env';
import { MemoryMailer } from '../src/lib/mailer';

export const SESSION_COOKIE = 'fz_session';

export async function createTestApp(overrides: Record<string, string> = {}, deps: AppDeps = {}) {
  const mailer = new MemoryMailer();
  const app = await buildApp(loadConfig({ ...process.env, ...overrides }), { mailer, ...deps });
  await app.ready();
  return { app, mailer };
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  cookies: Array<{ name: string; value: string }>;
}

export function client(app: FastifyInstance, cookie?: string) {
  const call = async <T = any>(
    method: InjectOptions['method'],
    url: string,
    payload?: unknown,
  ): Promise<ApiResponse<T>> => {
    const res = await app.inject({
      method,
      url,
      ...(payload !== undefined && { payload: payload as InjectOptions['payload'] }),
      ...(cookie && { cookies: { [SESSION_COOKIE]: cookie } }),
    });
    return {
      status: res.statusCode,
      body: (res.body ? res.json() : undefined) as T,
      cookies: res.cookies.map((c) => ({ name: c.name, value: c.value })),
    };
  };
  return {
    cookie,
    get: <T = any>(url: string) => call<T>('GET', url),
    post: <T = any>(url: string, body: unknown = {}) => call<T>('POST', url, body),
    put: <T = any>(url: string, body: unknown = {}) => call<T>('PUT', url, body),
    patch: <T = any>(url: string, body: unknown = {}) => call<T>('PATCH', url, body),
    del: <T = any>(url: string) => call<T>('DELETE', url),
  };
}

export type Client = ReturnType<typeof client>;

export async function registerUser(
  app: FastifyInstance,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) {
  const email = (overrides.email ?? `${randomUUID()}@test.local`).toLowerCase();
  const password = overrides.password ?? 'clave-segura-123';
  const res = await client(app).post('/api/auth/register', {
    name: overrides.name ?? 'Usuario Test',
    email,
    password,
  });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
  return {
    email,
    password,
    cookie,
    user: res.body.user as { id: string; name: string; email: string },
    api: client(app, cookie),
  };
}
