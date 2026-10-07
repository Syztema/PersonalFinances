import { z } from 'zod';

const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string('DATABASE_URL es obligatoria').min(1, 'DATABASE_URL es obligatoria'),
  APP_URL: z.url('APP_URL debe ser una URL completa, por ejemplo https://finanzas.midominio.com'),
  ALLOW_REGISTRATION: bool('true'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).default(587),
  SMTP_SECURE: bool('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Finanzas <no-reply@localhost>'),
});

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  host: string;
  port: number;
  databaseUrl: string;
  appUrl: string;
  appOrigin: string;
  allowRegistration: boolean;
  sessionTtlDays: number;
  trustProxyHops: number;
  corsOrigins: string[];
  logLevel: string;
  rateLimitMax: number;
  loginMaxAttempts: number;
  cookieSecure: boolean;
  smtp: SmtpConfig | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Docker Compose entrega variables vacías como ''; se tratan como ausentes.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${details}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    appUrl: e.APP_URL.replace(/\/$/, ''),
    appOrigin: new URL(e.APP_URL).origin,
    allowRegistration: e.ALLOW_REGISTRATION,
    sessionTtlDays: e.SESSION_TTL_DAYS,
    trustProxyHops: e.TRUST_PROXY_HOPS,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel: e.LOG_LEVEL,
    rateLimitMax: e.RATE_LIMIT_MAX,
    loginMaxAttempts: e.LOGIN_MAX_ATTEMPTS,
    cookieSecure: isProduction,
    smtp: e.SMTP_HOST
      ? {
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          user: e.SMTP_USER,
          pass: e.SMTP_PASS,
          from: e.SMTP_FROM,
        }
      : null,
  };
}
