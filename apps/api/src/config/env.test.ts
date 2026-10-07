import { describe, expect, it } from 'vitest';
import { loadConfig } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  APP_URL: 'https://finanzas.example.com',
};

describe('loadConfig', () => {
  it('applies defaults and derives the origin', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      allowRegistration: true,
      sessionTtlDays: 30,
      trustProxyHops: 1,
      appOrigin: 'https://finanzas.example.com',
      corsOrigins: [],
      smtp: null,
      cookieSecure: false,
    });
  });

  it('treats empty strings as missing and fails on required values', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...base, APP_URL: 'no-es-url' })).toThrow(/APP_URL/);
    expect(loadConfig({ ...base, RATE_LIMIT_MAX: '' }).rateLimitMax).toBe(300);
  });

  it('parses booleans, lists and SMTP', () => {
    const c = loadConfig({
      ...base,
      NODE_ENV: 'production',
      ALLOW_REGISTRATION: 'false',
      TRUST_PROXY_HOPS: '2',
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
    });
    expect(c.allowRegistration).toBe(false);
    expect(c.trustProxyHops).toBe(2);
    expect(c.cookieSecure).toBe(true);
    expect(c.corsOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(c.smtp).toMatchObject({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'user',
    });
  });
});
