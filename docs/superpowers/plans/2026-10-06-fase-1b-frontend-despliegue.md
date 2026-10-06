# Fase 1B — Frontend web responsive, Docker/Dokploy y README: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página web responsive (diseñada primero para pantallas de celular; no es una app nativa) que consume la API de la Fase 1A (auth, dashboard del núcleo, registro rápido, movimientos, cuentas, tarjetas, préstamos, categorías), empaquetada con Docker Compose lista para Dokploy, con README completo.

**Architecture:** `apps/web` (React 19 + Vite 8 + Tailwind v4 + React Router 7 en modo librería + TanStack Query 5). Un cliente `fetch` delgado contra `/api` (mismo origen). Formularios con estado controlado y validación con los esquemas de `@finanzas/shared`. En producción, nginx sirve la SPA y reenvía `/api` al contenedor `api`.

**Tech Stack:** React 19.3, Vite 8.3, @vitejs/plugin-react 6, Tailwind 4.3 (`@tailwindcss/vite`), React Router 7.18, TanStack Query 5, Radix Dialog, lucide-react, Vitest 5 + Testing Library + jsdom, nginx-unprivileged, Postgres 17, `prodrigestivill/postgres-backup-local`.

**Spec:** `docs/superpowers/specs/2026-10-06-finanzas-design.md` · **Depende de:** `docs/superpowers/plans/2026-10-06-fase-1a-backend.md` (completo y en verde).

## Global Constraints

- Mobile first: diseñar para 360 px; contenido con `max-w-3xl`; navegación inferior en móvil y barra lateral desde `lg`.
- Zonas de toque ≥ 44 px (`min-h-11`); inputs con `text-base` (16 px) para evitar el zoom de iOS; números con `tabular-nums`.
- Colores semánticos por tokens CSS: `positive` (verde, ingresos), `negative` (rojo, gastos y deudas), `warning` (ámbar), neutro para transferencias y pagos. **Pagos de tarjeta, pagos de préstamo y transferencias nunca se pintan en rojo ni con signo `-`.**
- Montos siempre con `formatCOP` de `@finanzas/shared` (`$1.500.000`).
- Filtros y montos nunca en la URL del navegador; formularios rápidos como paneles sobre la ruta actual (sin cambiar la URL).
- Textos en español de Colombia.
- Sin fuentes ni scripts externos (la CSP de nginx es `default-src 'self'`).
- `localStorage` solo para comodidades del usuario (última cuenta usada, uso de categorías) y siempre dentro de `try/catch`.
- Desviación respecto al stack del spec: no se usa react-hook-form; los formularios son pequeños y usan estado controlado + esquemas Zod compartidos (menos dependencias, misma validación).
- Commits: un único commit al final de este plan para toda la Fase 1, mensaje de una frase, y `git push origin main`.

## Review Focus

1. Doble toque en "Guardar" con conexión lenta → un solo movimiento; el botón queda deshabilitado mientras la petición está en curso. *(Test en Task 19.)*
2. Sesión que expira mientras la app está abierta (cualquier 401 que no sea login) → se limpia la caché y se va a `/login` con "Tu sesión expiró", sin bucles. *(Test en Task 17.)*
3. Escribir o pegar montos (`25000`, `$1.500.000,50`, borrar todo) → el campo muestra `$25.000` / `$1.500.000` / vacío y nunca envía `NaN`. *(Test en Task 16.)*
4. Pago de tarjeta en el historial → se ve como "Pago tarjeta" en gris, sin `-$`, y no aparece como gasto. *(Test en Task 20.)*
5. Usuario nuevo sin cuentas → el dashboard muestra cómo empezar (crear cuenta) en lugar de ceros confusos o errores; los formularios rápidos explican que primero debe crear una cuenta. *(Test en Task 18.)*

---

## Estructura de archivos (Fase 1B)

```
apps/web/
  package.json, tsconfig.json, vite.config.ts, index.html, Dockerfile, nginx.conf
  public/favicon.svg
  src/main.tsx, src/index.css, src/test-setup.ts
  src/app/router.tsx, providers.tsx, AppLayout.tsx, BottomNav.tsx, Sidebar.tsx,
         RequireAuth.tsx, PublicOnly.tsx, NotFoundPage.tsx
  src/lib/api.ts(+test), queries.ts, format.ts(+test), cn.ts, storage.ts, icons.tsx, useDebounced.ts
  src/components/ui/Button.tsx, Field.tsx, MoneyInput.tsx(+test), Sheet.tsx, Card.tsx,
         Amount.tsx, Chips.tsx, Spinner.tsx, EmptyState.tsx, Toast.tsx, ConfirmButton.tsx
  src/features/auth/useAuth.ts, LoginPage.tsx, RegisterPage.tsx, ForgotPasswordPage.tsx,
         ResetPasswordPage.tsx, AuthShell.tsx, (+ test require-auth.test.tsx)
  src/features/dashboard/DashboardPage.tsx(+test), MoneySummaryCard.tsx, MonthCard.tsx,
         AccountsCard.tsx, CardsSection.tsx, LoansSection.tsx, AvailableSheet.tsx
  src/features/quick-add/QuickAddContext.tsx, QuickAddMenu.tsx, QuickAddSheets.tsx,
         TransactionForm.tsx(+test), TransferForm.tsx, PayCardForm.tsx, PayLoanForm.tsx,
         useCatalog.ts, useSaveTransaction.ts, warnings.ts, DateChips.tsx
  src/features/transactions/TransactionsPage.tsx, TransactionRow.tsx(+test),
         FiltersSheet.tsx, TransactionDetailSheet.tsx, describe.ts
  src/features/accounts/AccountsPage.tsx, AccountFormSheet.tsx
  src/features/cards/CardsPage.tsx, CardFormSheet.tsx, CardDetailPage.tsx
  src/features/debts/DebtsPage.tsx, DebtFormSheet.tsx, DisbursementSheet.tsx
  src/features/categories/CategoriesPage.tsx, CategoryFormSheet.tsx
  src/features/more/MorePage.tsx, BudgetsPage.tsx
  src/features/profile/ProfilePage.tsx
apps/api/Dockerfile
docker-compose.yml, .env.example, .dockerignore, docker/backup/README.md
README.md
```

---

### Task 16: Proyecto web, estilos base, cliente de API y componentes de interfaz

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/public/favicon.svg`, `apps/web/src/index.css`, `apps/web/src/test-setup.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/cn.ts`, `apps/web/src/lib/storage.ts`, `apps/web/src/lib/format.ts`, `apps/web/src/lib/icons.tsx`, `apps/web/src/lib/useDebounced.ts`, `apps/web/src/components/ui/{Button,Field,MoneyInput,Sheet,Card,Amount,Chips,Spinner,EmptyState,Toast,ConfirmButton}.tsx`
- Test: `apps/web/src/lib/api.test.ts`, `apps/web/src/lib/format.test.ts`, `apps/web/src/components/ui/MoneyInput.test.tsx`

**Interfaces:**
- Consumes: `formatCOP`, `parseCOP`, `MAX_AMOUNT`, `addDays`, `ApiErrorBody`, `IsoDate` de `@finanzas/shared`.
- Produces:
  - `class ApiError(status, code, message, fields?)`; `api.get/post/put/patch/del<T>(path, body?)` contra `/api`; `onUnauthorized(listener): () => void` (se dispara con cualquier 401 excepto `/auth/login` y `/auth/me`).
  - `cn(...classes)`, `readJSON(key, fallback)`, `writeJSON(key, value)`, `useDebounced(value, delay?)`.
  - `formatShortDate(iso)` (`06 oct`), `formatDate(iso)` (`06/10/2026`), `monthLabel('2026-10')` (`octubre`), `dayHeading(iso, today)` (`Hoy`/`Ayer`/`lunes 5 de octubre`), `formatPercent(ratio)` (`20%`); re-exporta `formatCOP`, `formatCOPCompact`.
  - `<Icon name size? className? />` y `ICON_CHOICES: string[]`.
  - UI: `Button` (`variant`: primary|secondary|ghost|danger, `size`: sm|md|lg, `loading`), `Field`, `TextInput`, `Select`, `inputClass`, `MoneyInput` (`value: number | null`, `onChange`, `size`: md|lg), `Sheet` (`open`, `onOpenChange`, `title`, `description?`), `Card`, `Amount` (`tone`: income|expense|neutral|debt), `Chips<T>`, `Spinner`, `PageSpinner`, `EmptyState`, `ToastProvider`/`useToast().show({ message, tone })`, `ConfirmButton`.

- [ ] **Step 1: Crear el paquete web**

`apps/web/package.json`:
```json
{
  "name": "@finanzas/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@finanzas/shared": "*",
    "@radix-ui/react-dialog": "^1.2.0",
    "@tanstack/react-query": "^5.104.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.52.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-router": "^7.18.4",
    "tailwind-merge": "^3.7.0",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@testing-library/dom": "^10.4.2",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.7",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.2",
    "jsdom": "^30.1.2",
    "tailwindcss": "^4.3.3",
    "vite": "^8.3.3",
    "vitest": "^5.0.3"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`apps/web/vite.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // El Origin del navegador (http://localhost:5173) coincide con APP_URL de la API en desarrollo.
    proxy: { '/api': { target: 'http://localhost:3000' } },
  },
  build: { target: 'es2022' },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], css: false },
});
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="es-CO">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0f766e" />
    <meta name="description" content="Control de finanzas personales en pesos colombianos" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>Finanzas</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f766e"/><text x="32" y="44" font-family="system-ui, sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="#ffffff">$</text></svg>
```

- [ ] **Step 2: Estilos base con tokens semánticos**

`apps/web/src/index.css`:
```css
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-border: var(--border);
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-primary: var(--primary);
  --color-primary-fg: var(--primary-fg);
  --color-positive: var(--positive);
  --color-negative: var(--negative);
  --color-warning: var(--warning);
  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

:root {
  --bg: #f5f6f8;
  --surface: #ffffff;
  --surface-2: #eef1f4;
  --border: #e2e6eb;
  --fg: #0f172a;
  --muted: #64748b;
  --primary: #0f766e;
  --primary-fg: #ffffff;
  --positive: #15803d;
  --negative: #be123c;
  --warning: #b45309;
  color-scheme: light;
}

html {
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}
```

`apps/web/src/test-setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

- [ ] **Step 3: Escribir tests que fallan**

`apps/web/src/lib/api.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, onUnauthorized } from './api';

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('sends JSON to /api with same-origin credentials', async () => {
    const fetchMock = mockFetch(201, { ok: true });
    await api.post('/accounts', { name: 'Nequi' });
    expect(fetchMock).toHaveBeenCalledWith('/api/accounts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"Nequi"}',
    });
  });

  it('turns error bodies into ApiError with fields', async () => {
    mockFetch(400, { error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos ingresados.', fields: { amount: 'Requerido' } } });
    const err = (await api.post('/transactions', {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', fields: { amount: 'Requerido' } });
  });

  it('notifies 401s except for login and me (review focus #2)', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    mockFetch(401, { error: { code: 'SESSION_EXPIRED', message: 'Tu sesión expiró.' } });
    await api.get('/dashboard').catch(() => undefined);
    await api.get('/auth/me').catch(() => undefined);
    await api.post('/auth/login', {}).catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('SESSION_EXPIRED');
    off();
  });

  it('reports network failures in Spanish and handles 204', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const err = (await api.get('/dashboard').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('NETWORK');
    mockFetch(204);
    await expect(api.del('/accounts/x')).resolves.toBeUndefined();
  });
});
```

`apps/web/src/lib/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dayHeading, formatDate, formatPercent, formatShortDate, monthLabel } from './format';

describe('format', () => {
  it('formats dates in Spanish', () => {
    expect(formatShortDate('2026-10-06')).toBe('06 oct');
    expect(formatDate('2026-10-06')).toBe('06/10/2026');
    expect(monthLabel('2026-10')).toBe('octubre');
    expect(formatPercent(0.2)).toBe('20%');
  });

  it('names day groups relative to today', () => {
    expect(dayHeading('2026-10-06', '2026-10-06')).toBe('Hoy');
    expect(dayHeading('2026-10-05', '2026-10-06')).toBe('Ayer');
    expect(dayHeading('2026-10-02', '2026-10-06')).toBe('viernes 2 de octubre');
    expect(dayHeading('2025-12-31', '2026-10-06')).toBe('miércoles 31 de diciembre de 2025');
  });
});
```

`apps/web/src/components/ui/MoneyInput.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyInput } from './MoneyInput';

function Harness({ onValue }: { onValue: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(null);
  return (
    <MoneyInput
      aria-label="Valor"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
}

describe('MoneyInput (review focus #3)', () => {
  it('formats while typing and reports integers', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText('Valor');
    await userEvent.type(input, '25000');
    expect(input).toHaveValue('$25.000');
    expect(onValue).toHaveBeenLastCalledWith(25000);
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('accepts pasted amounts with a decimal part and can be cleared', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText('Valor');
    await userEvent.click(input);
    await userEvent.paste('$1.500.000,50');
    expect(input).toHaveValue('$1.500.000');
    expect(onValue).toHaveBeenLastCalledWith(1500000);
    await userEvent.clear(input);
    expect(input).toHaveValue('');
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('ignores values above the maximum', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.type(screen.getByLabelText('Valor'), '10000000000000');
    expect(onValue).not.toHaveBeenCalledWith(10_000_000_000_000);
  });
});
```

- [ ] **Step 4: Verificar que fallan**

Run: `npm install && npm test -w @finanzas/web`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 5: Implementar librerías**

`apps/web/src/lib/api.ts`:
```ts
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

const SILENT_401 = new Set(['/auth/login', '/auth/me']);

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
```

`apps/web/src/lib/cn.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...classes: ClassValue[]) => twMerge(clsx(classes));
```

`apps/web/src/lib/storage.ts`:
```ts
/** Solo comodidades locales; puede fallar en modo privado, por eso todo va en try/catch. */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento disponible: se ignora
  }
}
```

`apps/web/src/lib/format.ts`:
```ts
import { addDays, type IsoDate } from '@finanzas/shared';

export { formatCOP, formatCOPCompact } from '@finanzas/shared';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const monthIndex = (iso: string) => Number(iso.slice(5, 7)) - 1;

export const formatShortDate = (iso: IsoDate) => `${iso.slice(8, 10)} ${MONTHS_SHORT[monthIndex(iso)]}`;
export const formatDate = (iso: IsoDate) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const monthLabel = (key: string) => MONTHS[monthIndex(key)] ?? key;
export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function dayHeading(iso: IsoDate, today: IsoDate): string {
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  const weekday = WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  const year = iso.slice(0, 4) !== today.slice(0, 4) ? ` de ${iso.slice(0, 4)}` : '';
  return `${weekday} ${Number(iso.slice(8, 10))} de ${MONTHS[monthIndex(iso)]}${year}`;
}
```

`apps/web/src/lib/useDebounced.ts`:
```ts
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
```

`apps/web/src/lib/icons.tsx`:
```tsx
import {
  Banknote,
  Briefcase,
  Bus,
  Circle,
  CircleEllipsis,
  CirclePlus,
  CreditCard,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Percent,
  PiggyBank,
  Repeat,
  Scale,
  ShoppingBag,
  Smartphone,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  banknote: Banknote,
  briefcase: Briefcase,
  bus: Bus,
  'circle-ellipsis': CircleEllipsis,
  'circle-plus': CirclePlus,
  'credit-card': CreditCard,
  film: Film,
  gift: Gift,
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  home: House,
  landmark: Landmark,
  laptop: Laptop,
  percent: Percent,
  'piggy-bank': PiggyBank,
  repeat: Repeat,
  scale: Scale,
  'shopping-bag': ShoppingBag,
  smartphone: Smartphone,
  tag: Tag,
  'trending-up': TrendingUp,
  utensils: Utensils,
  wallet: Wallet,
  zap: Zap,
};

export const ICON_CHOICES = Object.keys(ICONS);

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const Component = ICONS[name] ?? Circle;
  return <Component size={size} className={className} aria-hidden />;
}
```

- [ ] **Step 6: Implementar componentes de interfaz**

`apps/web/src/components/ui/Spinner.tsx`:
```tsx
import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-5 animate-spin', className)} aria-hidden />;
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted" role="status" aria-label="Cargando">
      <Spinner className="size-7" />
    </div>
  );
}
```

`apps/web/src/components/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:opacity-90',
  secondary: 'bg-surface-2 text-fg hover:bg-border',
  ghost: 'bg-transparent text-fg hover:bg-surface-2',
  danger: 'bg-negative text-white hover:opacity-90',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'lg' && 'min-h-12 w-full text-base',
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
```

`apps/web/src/components/ui/Field.tsx`:
```tsx
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const inputClass =
  'w-full min-h-11 rounded-xl border border-border bg-surface px-3 text-base text-fg outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20';

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor?: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-sm text-negative">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, className)} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn(inputClass, 'py-2', className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, className)} />;
}
```

`apps/web/src/components/ui/MoneyInput.tsx`:
```tsx
import { formatCOP, MAX_AMOUNT, parseCOP } from '@finanzas/shared';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { inputClass } from './Field';

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  value: number | null;
  onChange: (value: number | null) => void;
  size?: 'md' | 'lg';
}

export function MoneyInput({ value, onChange, size = 'md', className, ...props }: MoneyInputProps) {
  return (
    <input
      {...props}
      inputMode="numeric"
      autoComplete="off"
      placeholder={props.placeholder ?? '$0'}
      value={value == null ? '' : formatCOP(value)}
      onChange={(e) => {
        const next = parseCOP(e.target.value);
        if (next !== null && next > MAX_AMOUNT) return;
        onChange(next);
      }}
      className={cn(
        size === 'lg'
          ? 'w-full bg-transparent text-center text-4xl font-semibold tabular-nums outline-none placeholder:text-border'
          : cn(inputClass, 'tabular-nums'),
        className,
      )}
    />
  );
}
```

`apps/web/src/components/ui/Sheet.tsx`:
```tsx
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Panel inferior en móvil; diálogo centrado desde `sm`. */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl outline-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              <Dialog.Description className={description ? 'text-sm text-muted' : 'sr-only'}>{description ?? title}</Dialog.Description>
            </div>
            <Dialog.Close className="-m-2 rounded-full p-2 text-muted hover:bg-surface-2" aria-label="Cerrar">
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

`apps/web/src/components/ui/Card.tsx`:
```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cn('rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border', className)} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={cn('text-sm font-semibold tracking-wide text-muted uppercase', className)} />;
}
```

`apps/web/src/components/ui/Amount.tsx`:
```tsx
import { formatCOP } from '@finanzas/shared';
import { cn } from '../../lib/cn';

export type AmountTone = 'income' | 'expense' | 'neutral' | 'debt';

export function Amount({ value, tone = 'neutral', className }: { value: number; tone?: AmountTone; className?: string }) {
  const text =
    tone === 'income' ? `+${formatCOP(Math.abs(value))}` : tone === 'expense' ? `-${formatCOP(Math.abs(value))}` : formatCOP(value);
  return (
    <span
      className={cn(
        'tabular-nums',
        tone === 'income' && 'text-positive',
        (tone === 'expense' || tone === 'debt') && 'text-negative',
        className,
      )}
    >
      {text}
    </span>
  );
}
```

`apps/web/src/components/ui/Chips.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition',
            value === o.value ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border bg-surface text-fg',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`apps/web/src/components/ui/EmptyState.tsx`:
```tsx
import type { ReactNode } from 'react';

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-6 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}
```

`apps/web/src/components/ui/Toast.tsx`:
```tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'success' | 'warning' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<{ show: (t: { message: string; tone?: Tone }) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback(({ message, tone = 'success' }: { message: string; tone?: Tone }) => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-sm text-white shadow-lg',
              t.tone === 'success' && 'bg-slate-900',
              t.tone === 'warning' && 'bg-warning',
              t.tone === 'error' && 'bg-negative',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fuera de ToastProvider');
  return ctx;
}
```

`apps/web/src/components/ui/ConfirmButton.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Button, type ButtonProps } from './Button';

/** Pide un segundo toque antes de ejecutar acciones destructivas. */
export function ConfirmButton({ onConfirm, children, confirmLabel = '¿Seguro? Toca de nuevo', ...props }: ButtonProps & { onConfirm: () => void; confirmLabel?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      variant="danger"
      {...props}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
```

- [ ] **Step 7: Verificar**

Run: `npm test -w @finanzas/web && npm run typecheck -w @finanzas/web && npm run lint`
Expected: PASS de `api.test.ts`, `format.test.ts` y `MoneyInput.test.tsx`; sin errores de tipos (si `lucide-react` no exporta algún ícono con ese nombre, `tsc` lo señala: usar el nombre vigente en `node_modules/lucide-react/dist/lucide-react.d.ts`).

---

### Task 17: Autenticación en el frontend — páginas, guardas y expiración de sesión

**Files:**
- Create: `apps/web/src/lib/queries.ts`, `apps/web/src/test-utils.tsx`, `apps/web/src/features/auth/useAuth.ts`, `apps/web/src/features/auth/useSessionExpiry.ts`, `apps/web/src/features/auth/AuthShell.tsx`, `apps/web/src/features/auth/LoginPage.tsx`, `apps/web/src/features/auth/RegisterPage.tsx`, `apps/web/src/features/auth/ForgotPasswordPage.tsx`, `apps/web/src/features/auth/ResetPasswordPage.tsx`, `apps/web/src/app/RequireAuth.tsx`, `apps/web/src/app/PublicOnly.tsx`
- Test: `apps/web/src/features/auth/auth.test.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `onUnauthorized` y componentes de UI (Task 16); DTOs de `@finanzas/shared`.
- Produces:
  - `qk` (claves: `me`, `dashboard`, `accounts`, `cards`, `card(id)`, `debts`, `categories`, `tags`, `transactions`), `invalidateFinance(queryClient)`, hooks `useAccounts()`, `useCards()`, `useDebts()`, `useCategories()` (cada uno devuelve la lista).
  - `useMe()`, `useLogin()`, `useRegister()`, `useLogout()`, `useToday(): IsoDate`.
  - `useSessionExpiry()` (redirige a `/login` con `state.expired = true` ante un 401 durante el uso).
  - `RequireAuth`, `PublicOnly` (elementos de ruta con `<Outlet />`).
  - Páginas: `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`.
  - Test helper `renderWithProviders(ui, { route? })` y `mockApi(routes)` para simular `fetch` por método y ruta.

- [ ] **Step 1: Crear utilidades de test**

`apps/web/src/test-utils.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { ToastProvider } from './components/ui/Toast';

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

type Handler = (body: unknown) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;

/** Simula la API: claves "GET /auth/me", "POST /transactions", etc. (sin query string). */
export function mockApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = input.replace(/^\/api/, '').split('?')[0];
    const handler = routes[`${method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No mock' } }), { status: 404 });
    const { status, body } = await handler(init?.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const demoUser = {
  id: 'u1',
  name: 'Cristian',
  email: 'demo@example.com',
  theme: 'SYSTEM',
  timezone: 'America/Bogota',
  createdAt: '2026-10-01T00:00:00.000Z',
};
```

- [ ] **Step 2: Escribir tests que fallan**

`apps/web/src/features/auth/auth.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '../../app/RequireAuth';
import { api } from '../../lib/api';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { LoginPage } from './LoginPage';
import { useSessionExpiry } from './useSessionExpiry';

afterEach(() => vi.unstubAllGlobals());

function Protected({ children }: { children: ReactNode }) {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={children} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}

describe('RequireAuth', () => {
  it('renders the protected page with a valid session', async () => {
    mockApi({ 'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }) });
    renderWithProviders(<Protected><p>Panel</p></Protected>, { route: '/dashboard' });
    expect(await screen.findByText('Panel')).toBeInTheDocument();
  });

  it('sends visitors without a session to the login page', async () => {
    mockApi({ 'GET /auth/me': () => ({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Inicia sesión.' } } }) });
    renderWithProviders(<Protected><p>Panel</p></Protected>, { route: '/dashboard' });
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(screen.queryByText(/Tu sesión expiró/)).not.toBeInTheDocument();
  });

  it('shows an offline screen instead of logging out on network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    renderWithProviders(<Protected><p>Panel</p></Protected>, { route: '/dashboard' });
    expect(await screen.findByText(/Sin conexión/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('session expiry while using the app (review focus #2)', () => {
  function DashboardThatExpires() {
    useSessionExpiry();
    useEffect(() => {
      api.get('/dashboard').catch(() => undefined);
    }, []);
    return <p>Panel</p>;
  }

  it('clears the session and shows the expired message on the login page', async () => {
    let meCalls = 0;
    mockApi({
      'GET /auth/me': () => {
        meCalls += 1;
        return meCalls === 1
          ? { status: 200, body: { user: demoUser } }
          : { status: 401, body: { error: { code: 'SESSION_EXPIRED', message: 'Tu sesión expiró.' } } };
      },
      'GET /dashboard': () => ({ status: 401, body: { error: { code: 'SESSION_EXPIRED', message: 'Tu sesión expiró.' } } }),
    });
    renderWithProviders(<Protected><DashboardThatExpires /></Protected>, { route: '/dashboard' });
    expect(await screen.findByText('Tu sesión expiró. Inicia sesión de nuevo.')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  it('posts the credentials and shows the API error message', async () => {
    const fetchMock = mockApi({
      'POST /auth/login': () => ({ status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' } } }),
    });
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { route: '/login' },
    );
    await userEvent.type(screen.getByLabelText('Email'), 'demo@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ body: JSON.stringify({ email: 'demo@example.com', password: 'mala-clave' }) })),
    );
  });
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w @finanzas/web -- auth`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 4: Implementar `lib/queries.ts`**

```ts
import type { AccountDTO, CategoryDTO, CreditCardDTO, DebtDTO } from '@finanzas/shared';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from './api';

export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  accounts: ['accounts'] as const,
  cards: ['cards'] as const,
  card: (id: string) => ['cards', id] as const,
  debts: ['debts'] as const,
  categories: ['categories'] as const,
  tags: ['tags'] as const,
  transactions: ['transactions'] as const,
};

/** Después de cualquier movimiento: saldos, deudas, dashboard e historial cambian. */
export function invalidateFinance(queryClient: QueryClient) {
  return Promise.all(
    [qk.dashboard, qk.accounts, qk.cards, qk.debts, qk.transactions, qk.tags].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

const items = <T>(path: string) => api.get<{ items: T[] }>(path).then((r) => r.items);

export const useAccounts = () => useQuery({ queryKey: qk.accounts, queryFn: () => items<AccountDTO>('/accounts') });
export const useCards = () => useQuery({ queryKey: qk.cards, queryFn: () => items<CreditCardDTO>('/credit-cards') });
export const useDebts = () => useQuery({ queryKey: qk.debts, queryFn: () => items<DebtDTO>('/debts') });
export const useCategories = () =>
  useQuery({ queryKey: qk.categories, queryFn: () => items<CategoryDTO>('/categories'), staleTime: 5 * 60_000 });
```

- [ ] **Step 5: Implementar hooks de auth**

`apps/web/src/features/auth/useAuth.ts`:
```ts
import { DEFAULT_TIMEZONE, todayIn, type IsoDate, type UserDTO } from '@finanzas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries';

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<{ user: UserDTO }>('/auth/me').then((r) => r.user),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

function useSessionStart(path: '/auth/login' | '/auth/register') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) => api.post<{ user: UserDTO }>(path, body).then((r) => r.user),
    onSuccess: (user) => {
      queryClient.clear();
      queryClient.setQueryData(qk.me, user);
    },
  });
}

export const useLogin = () => useSessionStart('/auth/login');
export const useRegister = () => useSessionStart('/auth/register');

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });
}

export function useToday(): IsoDate {
  const me = useMe();
  return todayIn(me.data?.timezone ?? DEFAULT_TIMEZONE);
}
```

`apps/web/src/features/auth/useSessionExpiry.ts`:
```ts
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { onUnauthorized } from '../../lib/api';

export function useSessionExpiry() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(
    () =>
      onUnauthorized(() => {
        queryClient.clear();
        navigate('/login', { replace: true, state: { expired: true } });
      }),
    [queryClient, navigate],
  );
}
```

- [ ] **Step 6: Implementar guardas**

`apps/web/src/app/RequireAuth.tsx`:
```tsx
import { WifiOff } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { useMe } from '../features/auth/useAuth';
import { ApiError } from '../lib/api';

export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <PageSpinner />;
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return (
        <Navigate
          to="/login"
          replace
          state={{ from: location.pathname, expired: me.error.code === 'SESSION_EXPIRED' }}
        />
      );
    }
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState
          icon={<WifiOff />}
          title="Sin conexión con el servidor"
          description="Revisa tu internet e intenta de nuevo."
          action={<Button onClick={() => void me.refetch()}>Reintentar</Button>}
        />
      </div>
    );
  }
  return <Outlet />;
}
```

`apps/web/src/app/PublicOnly.tsx`:
```tsx
import { Navigate, Outlet } from 'react-router';
import { PageSpinner } from '../components/ui/Spinner';
import { useMe } from '../features/auth/useAuth';

export function PublicOnly() {
  const me = useMe();
  if (me.isPending) return <PageSpinner />;
  if (me.isSuccess) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
```

- [ ] **Step 7: Implementar páginas de auth**

`apps/web/src/features/auth/AuthShell.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-9" />
          <span className="text-xl font-semibold">Finanzas</span>
        </div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
        <div className="mt-6 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-border">{children}</div>
      </div>
    </main>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <p className={cn('mb-4 rounded-xl px-3 py-2 text-sm', tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary')}>
      {children}
    </p>
  );
}
```

`apps/web/src/features/auth/LoginPage.tsx`:
```tsx
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { AuthShell, Notice } from './AuthShell';
import { useLogin } from './useAuth';

interface LoginState {
  from?: string;
  expired?: boolean;
  message?: string;
}

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const state = (useLocation().state ?? null) as LoginState | null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const error = login.error instanceof ApiError ? login.error : null;

  return (
    <AuthShell title="Inicia sesión" subtitle="Tu dinero claro, en segundos.">
      {state?.expired && <Notice tone="warning">Tu sesión expiró. Inicia sesión de nuevo.</Notice>}
      {state?.message && <Notice>{state.message}</Notice>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate(
            { email, password },
            { onSuccess: () => navigate(state?.from && state.from !== '/login' ? state.from : '/dashboard', { replace: true }) },
          );
        }}
      >
        <Field label="Email" htmlFor="email" error={error?.fields?.email}>
          <TextInput id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={error?.fields?.password}>
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && !error.fields && (
          <p role="alert" className="text-sm text-negative">
            {error.message}
          </p>
        )}
        <Button type="submit" size="lg" loading={login.isPending}>
          Entrar
        </Button>
      </form>
      <div className="mt-4 flex justify-between gap-2 text-sm">
        <Link className="text-primary" to="/forgot-password">
          ¿Olvidaste tu contraseña?
        </Link>
        <Link className="text-primary" to="/register">
          Crear cuenta
        </Link>
      </div>
    </AuthShell>
  );
}
```

`apps/web/src/features/auth/RegisterPage.tsx`:
```tsx
import { useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { AuthShell } from './AuthShell';
import { useRegister } from './useAuth';

export function RegisterPage() {
  const register = useRegister();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const error = register.error instanceof ApiError ? register.error : null;
  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  return (
    <AuthShell title="Crea tu cuenta" subtitle="Empieza a controlar tus finanzas en COP.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate(form, { onSuccess: () => navigate('/dashboard', { replace: true }) });
        }}
      >
        <Field label="Nombre" htmlFor="name" error={error?.fields?.name}>
          <TextInput id="name" autoComplete="given-name" required value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email" htmlFor="email" error={error?.fields?.email}>
          <TextInput id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={error?.fields?.password} hint="Mínimo 8 caracteres.">
          <TextInput id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} />
        </Field>
        {error && !error.fields && (
          <p role="alert" className="text-sm text-negative">
            {error.message}
          </p>
        )}
        <Button type="submit" size="lg" loading={register.isPending}>
          Crear cuenta
        </Button>
      </form>
      <p className="mt-4 text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link className="text-primary" to="/login">
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
```

`apps/web/src/features/auth/ForgotPasswordPage.tsx`:
```tsx
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { api, ApiError } from '../../lib/api';
import { AuthShell, Notice } from './AuthShell';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const forgot = useMutation({
    mutationFn: () => api.post<{ message: string }>('/auth/forgot-password', { email }),
  });
  const error = forgot.error instanceof ApiError ? forgot.error : null;

  return (
    <AuthShell title="Recupera tu contraseña" subtitle="Te enviaremos un enlace a tu email.">
      {forgot.isSuccess ? (
        <Notice>{forgot.data.message}</Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            forgot.mutate();
          }}
        >
          <Field label="Email" htmlFor="email" error={error?.fields?.email ?? (error && !error.fields ? error.message : undefined)}>
            <TextInput id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" loading={forgot.isPending}>
            Enviar enlace
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm">
        <Link className="text-primary" to="/login">
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthShell>
  );
}
```

`apps/web/src/features/auth/ResetPasswordPage.tsx`:
```tsx
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { api, ApiError } from '../../lib/api';
import { AuthShell, Notice } from './AuthShell';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  // El token llega después de "#": nunca viaja al servidor ni queda en sus logs.
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const reset = useMutation({
    mutationFn: () => api.post('/auth/reset-password', { token, password }),
    onSuccess: () => navigate('/login', { replace: true, state: { message: 'Tu contraseña se actualizó. Inicia sesión.' } }),
  });
  const error = reset.error instanceof ApiError ? reset.error : null;

  if (!token) {
    return (
      <AuthShell title="Enlace inválido">
        <Notice tone="warning">El enlace no es válido o está incompleto.</Notice>
        <Link className="text-primary" to="/forgot-password">
          Solicitar un nuevo enlace
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Nueva contraseña">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirm) return setMismatch(true);
          setMismatch(false);
          reset.mutate();
        }}
      >
        <Field label="Nueva contraseña" htmlFor="password" error={error?.fields?.password} hint="Mínimo 8 caracteres.">
          <TextInput id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Repite la contraseña" htmlFor="confirm" error={mismatch ? 'Las contraseñas no coinciden' : undefined}>
          <TextInput id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && !error.fields && (
          <p role="alert" className="text-sm text-negative">
            {error.message}
          </p>
        )}
        <Button type="submit" size="lg" loading={reset.isPending}>
          Guardar contraseña
        </Button>
      </form>
    </AuthShell>
  );
}
```

- [ ] **Step 8: Verificar**

Run: `npm test -w @finanzas/web && npm run typecheck -w @finanzas/web && npm run lint`
Expected: PASS de los 5 tests de `auth.test.tsx` y de los anteriores.

---

### Task 18: Enrutador, layout con navegación inferior, menú "+" y dashboard

**Files:**
- Create: `apps/web/src/main.tsx`, `apps/web/src/app/providers.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/app/AppLayout.tsx`, `apps/web/src/app/BottomNav.tsx`, `apps/web/src/app/Sidebar.tsx`, `apps/web/src/app/navigation.ts`, `apps/web/src/app/NotFoundPage.tsx`, `apps/web/src/features/quick-add/QuickAddContext.tsx`, `apps/web/src/features/quick-add/QuickAddMenu.tsx`, `apps/web/src/features/quick-add/QuickAddSheets.tsx`, `apps/web/src/features/dashboard/DashboardPage.tsx`, `apps/web/src/features/dashboard/MoneySummaryCard.tsx`, `apps/web/src/features/dashboard/AvailableSheet.tsx`, `apps/web/src/features/dashboard/MonthCard.tsx`, `apps/web/src/features/dashboard/AccountsCard.tsx`, `apps/web/src/features/dashboard/CardsSection.tsx`, `apps/web/src/features/dashboard/LoansSection.tsx`, `apps/web/src/features/more/MorePage.tsx`, `apps/web/src/features/more/BudgetsPage.tsx`
- Modify: `apps/web/src/components/ui/EmptyState.tsx` (agrega `ErrorState`)
- Test: `apps/web/src/features/dashboard/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: hooks y páginas de auth (Task 17); `qk`, `api` (Tasks 16–17); `DashboardDTO`, `ACCOUNT_TYPE_LABELS` de `@finanzas/shared`.
- Produces:
  - `router` (React Router con rutas `/login`, `/register`, `/forgot-password`, `/reset-password`, `/dashboard`, `/budgets`, `/more`, `*`); las tareas 20–21 agregan `/transactions`, `/accounts`, `/cards`, `/cards/:id`, `/debts`, `/categories`, `/profile` dentro de `appRoutes`.
  - `QuickAddProvider`, `useQuickAdd(): { request, open(req), close() }` con `QuickAddRequest { kind: 'menu' | 'expense' | 'income' | 'transfer' | 'card-purchase' | 'card-payment' | 'loan-payment'; cardId?; debtId?; edit?: TransactionDTO }`.
  - `QuickAddMenu({ onPick, hasDebts })`, `QuickAddSheets` (en esta tarea solo el menú; Task 19 agrega los formularios).
  - `ErrorState({ error, onRetry })`.
  - `PRIMARY_NAV`, `SECONDARY_NAV` (arreglos de `{ to, label, icon }`).

- [ ] **Step 1: Escribir el test que falla**

`apps/web/src/features/dashboard/DashboardPage.test.tsx`:
```tsx
import type { DashboardDTO } from '@finanzas/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithProviders } from '../../test-utils';
import { QuickAddProvider, useQuickAdd } from '../quick-add/QuickAddContext';
import { DashboardPage } from './DashboardPage';

afterEach(() => vi.unstubAllGlobals());

const base: DashboardDTO = {
  greetingName: 'Cristian',
  today: '2026-10-20',
  month: '2026-10',
  money: { total: 2_500_000, liquid: 2_500_000, savings: 0, investment: 0, accounts: [] },
  available: {
    total: 1_600_000,
    breakdown: [
      { key: 'liquid', label: 'Dinero líquido (sin ahorro ni inversión)', amount: 2_500_000 },
      { key: 'cards', label: 'Tarjetas: deuda comprometida', amount: -900_000 },
    ],
  },
  debts: { cards: 900_000, loans: 0, total: 900_000 },
  netWorth: 1_700_000,
  thisMonth: { income: 4_000_000, expense: 2_100_000, savings: 800_000, investment: 0, remaining: 1_100_000, savingsRate: 0.2, savingsTargetPct: 20 },
  cards: [],
  loans: [],
};

const account = (id: string, name: string, type: 'BANK' | 'DIGITAL_WALLET' | 'CASH', balance: number) => ({
  id,
  name,
  type,
  institution: null,
  initialBalance: 0,
  openingDate: '2026-10-01',
  icon: 'wallet',
  color: '#123456',
  isActive: true,
  sortOrder: 0,
  balance,
});

const card = {
  id: 'c1',
  name: 'Nu Crédito',
  issuer: 'Nu',
  creditLimit: 5_000_000,
  initialDebt: 0,
  initialDebtInstallments: 1,
  openingDate: '2026-10-01',
  statementDay: 15,
  paymentDueDay: 30,
  icon: 'credit-card',
  color: '#820ad1',
  isActive: true,
  sortOrder: 0,
  debt: 1_800_000,
  available: 3_200_000,
  utilization: 0.36,
  amountDue: 450_000,
  dueDate: '2026-10-30',
  isOverdue: false,
  lastCutoff: '2026-10-15',
  nextCutoff: '2026-11-15',
  nextDueDate: '2026-11-30',
  committed: 900_000,
};

function RequestProbe() {
  const { request } = useQuickAdd();
  return <output data-testid="request">{request ? `${request.kind}:${request.cardId ?? ''}` : 'none'}</output>;
}

function renderDashboard(data: DashboardDTO) {
  mockApi({ 'GET /dashboard': () => ({ status: 200, body: data }) });
  return renderWithProviders(
    <QuickAddProvider>
      <DashboardPage />
      <RequestProbe />
    </QuickAddProvider>,
  );
}

describe('DashboardPage', () => {
  it('shows totals, month balance, accounts and cards', async () => {
    renderDashboard({
      ...base,
      money: {
        ...base.money,
        accounts: [account('a1', 'Bancolombia', 'BANK', 1_500_000), account('a2', 'Nequi', 'DIGITAL_WALLET', 300_000), account('a3', 'Efectivo', 'CASH', 700_000)],
      },
      cards: [card],
    });
    expect(await screen.findByRole('heading', { name: 'Hola, Cristian' })).toBeInTheDocument();
    expect(screen.getByText('Resumen de octubre')).toBeInTheDocument();
    expect(screen.getAllByText('$2.500.000').length).toBeGreaterThan(0);
    expect(screen.getByText('$1.600.000')).toBeInTheDocument();
    expect(screen.getByText('+$4.000.000')).toBeInTheDocument();
    expect(screen.getByText('-$2.100.000')).toBeInTheDocument();
    expect(screen.getByText('Bancolombia')).toBeInTheDocument();
    expect(screen.getByText('$3.200.000')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Pagar tarjeta Nu Crédito' }));
    expect(screen.getByTestId('request')).toHaveTextContent('card-payment:c1');
  });

  it('explains how the estimated available money is computed', async () => {
    renderDashboard({ ...base, money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 2_500_000)] } });
    await userEvent.click(await screen.findByRole('button', { name: /Disponible estimado/ }));
    expect(await screen.findByText('Tarjetas: deuda comprometida')).toBeInTheDocument();
    expect(screen.getByText('-$900.000')).toBeInTheDocument();
  });

  it('guides a brand-new user instead of showing empty numbers (review focus #5)', async () => {
    renderDashboard({ ...base, money: { ...base.money, total: 0, liquid: 0 } });
    expect(await screen.findByText('Crea tu primera cuenta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agregar cuenta' })).toHaveAttribute('href', '/accounts');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -w @finanzas/web -- DashboardPage`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: `ErrorState`, contexto y menú de registro rápido**

Agregar a `apps/web/src/components/ui/EmptyState.tsx`:
```tsx
import { CircleAlert } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { Button } from './Button';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'No pudimos cargar la información.';
  return (
    <EmptyState
      icon={<CircleAlert />}
      title={message}
      action={onRetry ? <Button variant="secondary" onClick={onRetry}>Reintentar</Button> : undefined}
    />
  );
}
```
(los imports van al inicio del archivo).

`apps/web/src/features/quick-add/QuickAddContext.tsx`:
```tsx
import type { TransactionDTO } from '@finanzas/shared';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type QuickAddKind = 'menu' | 'expense' | 'income' | 'transfer' | 'card-purchase' | 'card-payment' | 'loan-payment';

export interface QuickAddRequest {
  kind: QuickAddKind;
  cardId?: string;
  debtId?: string;
  edit?: TransactionDTO;
}

interface QuickAddValue {
  request: QuickAddRequest | null;
  open: (request: QuickAddRequest) => void;
  close: () => void;
}

const QuickAddCtx = createContext<QuickAddValue | null>(null);

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<QuickAddRequest | null>(null);
  const value = useMemo(() => ({ request, open: setRequest, close: () => setRequest(null) }), [request]);
  return <QuickAddCtx.Provider value={value}>{children}</QuickAddCtx.Provider>;
}

export function useQuickAdd() {
  const ctx = useContext(QuickAddCtx);
  if (!ctx) throw new Error('useQuickAdd fuera de QuickAddProvider');
  return ctx;
}
```

`apps/web/src/features/quick-add/QuickAddMenu.tsx`:
```tsx
import { ArrowLeftRight, CreditCard, Landmark, Minus, Plus, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { QuickAddKind } from './QuickAddContext';

interface Option {
  kind: QuickAddKind;
  label: string;
  hint: string;
  icon: ReactNode;
  tone: string;
}

const OPTIONS: Option[] = [
  { kind: 'expense', label: 'Gasto', hint: 'Con efectivo, cuenta o tarjeta', icon: <Minus />, tone: 'bg-negative/10 text-negative' },
  { kind: 'income', label: 'Ingreso', hint: 'Salario, ventas, extras', icon: <Plus />, tone: 'bg-positive/10 text-positive' },
  { kind: 'transfer', label: 'Transferencia', hint: 'Entre tus cuentas o a ahorro', icon: <ArrowLeftRight />, tone: 'bg-surface-2 text-fg' },
  { kind: 'card-purchase', label: 'Compra con tarjeta', hint: 'Aumenta la deuda, no tu cuenta', icon: <CreditCard />, tone: 'bg-surface-2 text-fg' },
  { kind: 'card-payment', label: 'Pagar tarjeta', hint: 'No es un gasto nuevo', icon: <Receipt />, tone: 'bg-surface-2 text-fg' },
  { kind: 'loan-payment', label: 'Pagar préstamo', hint: 'Capital e intereses', icon: <Landmark />, tone: 'bg-surface-2 text-fg' },
];

export function QuickAddMenu({ onPick, hasDebts }: { onPick: (kind: QuickAddKind) => void; hasDebts: boolean }) {
  return (
    <ul className="grid gap-2">
      {OPTIONS.filter((o) => o.kind !== 'loan-payment' || hasDebts).map((o) => (
        <li key={o.kind}>
          <button
            type="button"
            onClick={() => onPick(o.kind)}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 text-left active:scale-[.99]"
          >
            <span className={cn('flex size-10 items-center justify-center rounded-full', o.tone)}>{o.icon}</span>
            <span>
              <span className="block font-medium">{o.label}</span>
              <span className="block text-xs text-muted">{o.hint}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

`apps/web/src/features/quick-add/QuickAddSheets.tsx` (versión inicial; Task 19 la reemplaza):
```tsx
import { Sheet } from '../../components/ui/Sheet';
import { useDebts } from '../../lib/queries';
import { useQuickAdd } from './QuickAddContext';
import { QuickAddMenu } from './QuickAddMenu';

export function QuickAddSheets() {
  const { request, open, close } = useQuickAdd();
  const debts = useDebts();
  return (
    <Sheet open={request?.kind === 'menu'} onOpenChange={(o) => !o && close()} title="¿Qué quieres registrar?">
      <QuickAddMenu hasDebts={(debts.data ?? []).some((d) => d.isActive)} onPick={(kind) => open({ kind })} />
    </Sheet>
  );
}
```

- [ ] **Step 4: Secciones del dashboard**

`apps/web/src/features/dashboard/AvailableSheet.tsx`:
```tsx
import type { BreakdownItem } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Sheet } from '../../components/ui/Sheet';

export function AvailableSheet({ open, onOpenChange, total, breakdown }: { open: boolean; onOpenChange: (o: boolean) => void; total: number; breakdown: BreakdownItem[] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="¿Cómo se calcula el disponible?" description="Lo que tienes hoy menos lo que ya está comprometido este mes.">
      <ul className="divide-y divide-border">
        {breakdown.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span>{item.label}</span>
            <Amount value={item.amount} tone={item.amount < 0 ? 'expense' : 'neutral'} className="font-medium" />
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 py-3 font-semibold">
          <span>Disponible estimado</span>
          <Amount value={total} tone={total < 0 ? 'debt' : 'neutral'} />
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted">
        Las cuotas futuras de compras diferidas cuentan como deuda, pero no le quitan disponible a este mes. Es una estimación basada en tus datos, no asesoría financiera.
      </p>
    </Sheet>
  );
}
```

`apps/web/src/features/dashboard/MoneySummaryCard.tsx`:
```tsx
import type { DashboardDTO } from '@finanzas/shared';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Card } from '../../components/ui/Card';
import { AvailableSheet } from './AvailableSheet';

export function MoneySummaryCard({ data }: { data: DashboardDTO }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <p className="text-sm text-muted">Dinero total</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight">
        <Amount value={data.money.total} tone={data.money.total < 0 ? 'debt' : 'neutral'} />
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-surface-2 p-3 text-left">
          <span className="flex items-center justify-between text-xs text-muted">
            Disponible estimado <ChevronRight size={14} aria-hidden />
          </span>
          <Amount value={data.available.total} tone={data.available.total < 0 ? 'debt' : 'neutral'} className="mt-1 block text-lg font-semibold" />
        </button>
        <div className="rounded-xl bg-surface-2 p-3">
          <span className="text-xs text-muted">Deudas</span>
          <Amount value={data.debts.total} tone={data.debts.total > 0 ? 'debt' : 'neutral'} className="mt-1 block text-lg font-semibold" />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Patrimonio neto aproximado: <Amount value={data.netWorth} className="font-medium text-fg" />
      </p>
      <AvailableSheet open={open} onOpenChange={setOpen} total={data.available.total} breakdown={data.available.breakdown} />
    </Card>
  );
}
```

`apps/web/src/features/dashboard/MonthCard.tsx`:
```tsx
import type { DashboardDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Card, CardTitle } from '../../components/ui/Card';
import { formatPercent } from '../../lib/format';

export function MonthCard({ data }: { data: DashboardDTO['thisMonth'] }) {
  const rows: Array<[string, number, 'income' | 'expense' | 'neutral']> = [
    ['Ingresos', data.income, 'income'],
    ['Gastos', data.expense, 'expense'],
    ['Ahorro', data.savings, 'neutral'],
  ];
  if (data.investment !== 0) rows.push(['Inversión', data.investment, 'neutral']);
  return (
    <Card>
      <CardTitle>Este mes</CardTitle>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex items-center justify-between">
            <dt className="text-sm">{label}</dt>
            <dd className="font-medium">
              <Amount value={value} tone={value === 0 ? 'neutral' : tone} />
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <dt className="text-sm font-medium">Restante del mes</dt>
          <dd className="font-semibold">
            <Amount value={data.remaining} tone={data.remaining < 0 ? 'debt' : 'neutral'} />
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">
        {data.savingsRate === null
          ? `Aún no registras ingresos este mes. Tu objetivo de ahorro es ${data.savingsTargetPct}%.`
          : `Ahorro actual: ${formatPercent(data.savingsRate)} de tus ingresos · objetivo ${data.savingsTargetPct}%.`}
      </p>
    </Card>
  );
}
```

`apps/web/src/features/dashboard/AccountsCard.tsx`:
```tsx
import { ACCOUNT_TYPE_LABELS, type AccountDTO } from '@finanzas/shared';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Card, CardTitle } from '../../components/ui/Card';
import { Icon } from '../../lib/icons';

export function AccountsCard({ accounts, total }: { accounts: AccountDTO[]; total: number }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Mi dinero</CardTitle>
        <Link to="/accounts" className="text-sm text-primary">
          Ver cuentas
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full text-white" style={{ backgroundColor: a.color }}>
              <Icon name={a.icon} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{a.name}</span>
              <span className="block text-xs text-muted">{ACCOUNT_TYPE_LABELS[a.type]}</span>
            </span>
            <Amount value={a.balance} tone={a.balance < 0 ? 'debt' : 'neutral'} className="text-sm font-medium" />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 font-semibold">
        <span>Total</span>
        <Amount value={total} />
      </div>
    </Card>
  );
}
```

`apps/web/src/features/dashboard/CardsSection.tsx`:
```tsx
import type { CreditCardDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { CardTitle } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import { formatShortDate } from '../../lib/format';
import { useQuickAdd } from '../quick-add/QuickAddContext';

export function CardsSection({ cards }: { cards: CreditCardDTO[] }) {
  const { open } = useQuickAdd();
  if (cards.length === 0) return null;
  return (
    <section>
      <CardTitle className="mb-2 px-1">Tarjetas</CardTitle>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {cards.map((c) => (
          <li key={c.id} className="w-[85%] max-w-sm shrink-0 snap-start rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{c.name}</span>
              <span className="size-3 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted">Cupo</dt>
                <dd className="font-medium"><Amount value={c.creditLimit} /></dd>
              </div>
              <div>
                <dt className="text-muted">{c.debt < 0 ? 'Saldo a favor' : 'Utilizado'}</dt>
                <dd className="font-medium"><Amount value={Math.abs(c.debt)} tone={c.debt > 0 ? 'debt' : 'neutral'} /></dd>
              </div>
              <div>
                <dt className="text-muted">Disponible</dt>
                <dd className="font-medium"><Amount value={c.available} /></dd>
              </div>
            </dl>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div
                className={cn('h-full rounded-full', c.utilization >= 0.8 ? 'bg-negative' : 'bg-primary')}
                style={{ width: `${Math.min(100, Math.round(c.utilization * 100))}%` }}
              />
            </div>
            <p className="mt-3 text-sm">
              {c.amountDue > 0 ? (
                <>
                  Pago del mes: <Amount value={c.amountDue} className="font-semibold" />{' '}
                  <span className={cn('text-xs', c.isOverdue ? 'font-medium text-negative' : 'text-muted')}>
                    {c.isOverdue ? `vencido desde ${formatShortDate(c.dueDate)}` : `vence ${formatShortDate(c.dueDate)}`}
                  </span>
                </>
              ) : c.committed > 0 ? (
                <>
                  Próximo pago estimado: <Amount value={c.committed} className="font-semibold" />{' '}
                  <span className="text-xs text-muted">{formatShortDate(c.nextDueDate)}</span>
                </>
              ) : (
                <span className="text-muted">Sin pagos pendientes</span>
              )}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3 w-full"
              aria-label={`Pagar tarjeta ${c.name}`}
              disabled={c.debt <= 0}
              onClick={() => open({ kind: 'card-payment', cardId: c.id })}
            >
              Pagar tarjeta
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`apps/web/src/features/dashboard/LoansSection.tsx`:
```tsx
import type { DebtDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { formatShortDate } from '../../lib/format';
import { useQuickAdd } from '../quick-add/QuickAddContext';

export function LoansSection({ loans }: { loans: DebtDTO[] }) {
  const { open } = useQuickAdd();
  if (loans.length === 0) return null;
  return (
    <Card>
      <CardTitle>Préstamos</CardTitle>
      <ul className="mt-3 space-y-3">
        {loans.map((l) => (
          <li key={l.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{l.name}</span>
              <span className="block text-xs text-muted">
                {l.installmentDue > 0 && l.nextPaymentDate
                  ? `Cuota pendiente ${formatShortDate(l.nextPaymentDate)}: `
                  : 'Saldo pendiente'}
                {l.installmentDue > 0 && <Amount value={l.installmentDue} />}
              </span>
            </span>
            <Amount value={l.balance} tone="debt" className="text-sm font-medium" />
            <Button size="sm" variant="secondary" aria-label={`Pagar préstamo ${l.name}`} onClick={() => open({ kind: 'loan-payment', debtId: l.id })}>
              Pagar
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

`apps/web/src/features/dashboard/DashboardPage.tsx`:
```tsx
import type { DashboardDTO } from '@finanzas/shared';
import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { monthLabel } from '../../lib/format';
import { qk } from '../../lib/queries';
import { AccountsCard } from './AccountsCard';
import { CardsSection } from './CardsSection';
import { LoansSection } from './LoansSection';
import { MoneySummaryCard } from './MoneySummaryCard';
import { MonthCard } from './MonthCard';

export function DashboardPage() {
  const query = useQuery({ queryKey: qk.dashboard, queryFn: () => api.get<DashboardDTO>('/dashboard') });
  if (query.isPending) return <PageSpinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const d = query.data;
  const isNew = d.money.accounts.length === 0 && d.cards.length === 0;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted">Resumen de {monthLabel(d.month)}</p>
        <h1 className="text-2xl font-semibold">Hola, {d.greetingName}</h1>
      </header>
      {isNew ? (
        <EmptyState
          icon={<Wallet />}
          title="Crea tu primera cuenta"
          description="Registra dónde tienes tu dinero (efectivo, Bancolombia, Nequi…) con su saldo actual. Después podrás anotar gastos e ingresos en segundos."
          action={
            <Link to="/accounts" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-medium text-primary-fg">
              Agregar cuenta
            </Link>
          }
        />
      ) : (
        <>
          <MoneySummaryCard data={d} />
          <MonthCard data={d.thisMonth} />
          <AccountsCard accounts={d.money.accounts} total={d.money.total} />
          <CardsSection cards={d.cards} />
          <LoansSection loans={d.loans} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Layout, navegación, páginas "Más" y "Presupuestos"**

`apps/web/src/app/navigation.ts`:
```ts
import { ArrowLeftRight, ChartPie, CreditCard, House, Landmark, Menu, Tags, UserRound, Wallet, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Inicio', icon: House },
  { to: '/transactions', label: 'Movimientos', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Presupuestos', icon: ChartPie },
  { to: '/more', label: 'Más', icon: Menu },
];

export const SECONDARY_NAV: NavItem[] = [
  { to: '/accounts', label: 'Mis cuentas', icon: Wallet },
  { to: '/cards', label: 'Tarjetas', icon: CreditCard },
  { to: '/debts', label: 'Préstamos', icon: Landmark },
  { to: '/categories', label: 'Categorías', icon: Tags },
  { to: '/profile', label: 'Perfil y seguridad', icon: UserRound },
];
```

`apps/web/src/app/BottomNav.tsx`:
```tsx
import { Plus } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '../lib/cn';
import { useQuickAdd } from '../features/quick-add/QuickAddContext';
import { PRIMARY_NAV, type NavItem } from './navigation';

function Item({ to, label, icon: IconComponent }: NavItem) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'font-medium text-primary' : 'text-muted')
        }
      >
        <IconComponent size={22} aria-hidden />
        {label}
      </NavLink>
    </li>
  );
}

export function BottomNav() {
  const { open } = useQuickAdd();
  const [first, second, third, fourth] = PRIMARY_NAV as [NavItem, NavItem, NavItem, NavItem];
  return (
    <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end">
        <Item {...first} />
        <Item {...second} />
        <li className="flex justify-center">
          <button
            type="button"
            aria-label="Agregar movimiento"
            onClick={() => open({ kind: 'menu' })}
            className="-mt-6 mb-1 flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg ring-4 ring-bg active:scale-95"
          >
            <Plus size={28} />
          </button>
        </li>
        <Item {...third} />
        <Item {...fourth} />
      </ul>
    </nav>
  );
}
```

`apps/web/src/app/Sidebar.tsx`:
```tsx
import { Plus } from 'lucide-react';
import { NavLink } from 'react-router';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';
import { useQuickAdd } from '../features/quick-add/QuickAddContext';
import { PRIMARY_NAV, SECONDARY_NAV } from './navigation';

export function Sidebar() {
  const { open } = useQuickAdd();
  const link = ({ isActive }: { isActive: boolean }) =>
    cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm', isActive ? 'bg-primary/10 font-medium text-primary' : 'text-fg hover:bg-surface-2');
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 lg:flex">
      <div className="flex items-center gap-2 px-2">
        <img src="/favicon.svg" alt="" className="size-8" />
        <span className="text-lg font-semibold">Finanzas</span>
      </div>
      <Button onClick={() => open({ kind: 'menu' })}>
        <Plus size={18} /> Agregar
      </Button>
      <nav aria-label="Navegación" className="flex flex-col gap-1">
        {[...PRIMARY_NAV.filter((i) => i.to !== '/more'), ...SECONDARY_NAV].map(({ to, label, icon: IconComponent }) => (
          <NavLink key={to} to={to} className={link}>
            <IconComponent size={18} aria-hidden /> {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

`apps/web/src/app/AppLayout.tsx`:
```tsx
import { Outlet } from 'react-router';
import { useSessionExpiry } from '../features/auth/useSessionExpiry';
import { QuickAddProvider } from '../features/quick-add/QuickAddContext';
import { QuickAddSheets } from '../features/quick-add/QuickAddSheets';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  useSessionExpiry();
  return (
    <QuickAddProvider>
      <div className="min-h-dvh lg:flex">
        <Sidebar />
        <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-28 lg:px-8 lg:pt-8 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <QuickAddSheets />
    </QuickAddProvider>
  );
}
```

`apps/web/src/features/more/MorePage.tsx`:
```tsx
import { ChevronRight, LogOut } from 'lucide-react';
import { Link } from 'react-router';
import { SECONDARY_NAV } from '../../app/navigation';
import { Button } from '../../components/ui/Button';
import { useLogout } from '../auth/useAuth';

export function MorePage() {
  const logout = useLogout();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Más</h1>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {SECONDARY_NAV.map(({ to, label, icon: IconComponent }) => (
          <li key={to}>
            <Link to={to} className="flex min-h-14 items-center gap-3 px-4">
              <IconComponent size={20} className="text-muted" aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronRight size={18} className="text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="lg" loading={logout.isPending} onClick={() => logout.mutate()}>
        <LogOut size={18} /> Cerrar sesión
      </Button>
      <p className="px-1 text-xs text-muted">
        Finanzas es un asistente basado únicamente en los datos que registras. No es asesoría financiera profesional.
      </p>
    </div>
  );
}
```

`apps/web/src/features/more/BudgetsPage.tsx`:
```tsx
import { ChartPie } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';

export function BudgetsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Presupuestos</h1>
      <EmptyState
        icon={<ChartPie />}
        title="Los presupuestos llegan en la próxima actualización"
        description="Podrás definir un presupuesto general y por categoría, con alertas al 50, 75, 90 y 100 %."
      />
    </div>
  );
}
```

`apps/web/src/app/NotFoundPage.tsx`:
```tsx
import { Link } from 'react-router';
import { EmptyState } from '../components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md p-6">
      <EmptyState
        title="Página no encontrada"
        action={
          <Link to="/dashboard" className="text-primary">
            Ir al inicio
          </Link>
        }
      />
    </div>
  );
}
```

- [ ] **Step 6: Enrutador, providers y punto de entrada**

`apps/web/src/app/router.tsx`:
```tsx
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { PageSpinner } from '../components/ui/Spinner';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';
import { PublicOnly } from './PublicOnly';
import { RequireAuth } from './RequireAuth';

/** Carga diferida: cada pantalla es un archivo JS aparte. */
const page = <M,>(load: () => Promise<M>, pick: (m: M) => ComponentType) => async () => ({ Component: pick(await load()) });

export const appRoutes: RouteObject[] = [
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/dashboard', lazy: page(() => import('../features/dashboard/DashboardPage'), (m) => m.DashboardPage) },
  { path: '/budgets', lazy: page(() => import('../features/more/BudgetsPage'), (m) => m.BudgetsPage) },
  { path: '/more', lazy: page(() => import('../features/more/MorePage'), (m) => m.MorePage) },
];

export const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    HydrateFallback: PageSpinner,
    children: [{ element: <AppLayout />, children: appRoutes }],
  },
  { path: '*', element: <NotFoundPage /> },
]);
```

`apps/web/src/app/providers.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ToastProvider } from '../components/ui/Toast';
import { ApiError } from '../lib/api';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Errores del cliente (4xx) no se reintentan; red o servidor, hasta 2 veces.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
```

`apps/web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/providers';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers />
  </StrictMode>,
);
```

- [ ] **Step 7: Verificar**

Run: `npm test -w @finanzas/web && npm run typecheck -w @finanzas/web && npm run lint`
Expected: PASS de los 3 tests del dashboard y de los anteriores.

Run (con la API en `npm run dev:api` y la base sembrada): `npm run dev:web`, abrir `http://localhost:5173` en modo responsive de 360 px, iniciar sesión con `demo@example.com` / `Demo12345!`.
Expected: dashboard con saludo, dinero total, disponible (al tocarlo abre el desglose), deudas, este mes, cuentas, tarjeta Nu Crédito con "Pagar tarjeta" y el préstamo. La navegación inferior se ve fija y el botón "+" abre el menú.

---

### Task 19: Registro rápido — gasto/compra con tarjeta, ingreso, transferencia, pagar tarjeta y pagar préstamo

**Files:**
- Create: `apps/web/src/features/quick-add/useSaveTransaction.ts`, `apps/web/src/features/quick-add/warnings.ts`, `apps/web/src/features/quick-add/DateChips.tsx`, `apps/web/src/features/quick-add/TransactionForm.tsx`, `apps/web/src/features/quick-add/TransferForm.tsx`, `apps/web/src/features/quick-add/PayCardForm.tsx`, `apps/web/src/features/quick-add/PayLoanForm.tsx`, `apps/web/src/features/quick-add/NeedsAccount.tsx`
- Modify: `apps/web/src/features/quick-add/QuickAddSheets.tsx` (reemplazo completo)
- Test: `apps/web/src/features/quick-add/TransactionForm.test.tsx`

**Interfaces:**
- Consumes: `useQuickAdd` (Task 18); `useAccounts`, `useCards`, `useDebts`, `useCategories`, `invalidateFinance` (Task 17); `useToday` (Task 17); UI (Task 16); tipos `TransactionDTO`, `TransactionResultDTO`, `WarningCode`, `CategoryDTO` de `@finanzas/shared`.
- Produces:
  - `useSaveTransaction(successMessage?): { submit(request: SaveRequest, callbacks?: { onSuccess?, onError?(ApiError) }), isPending }` con `SaveRequest { path; method: 'POST' | 'PUT'; body }`; invalida datos, muestra avisos y descarta envíos repetidos mientras uno está en curso.
  - `WARNING_MESSAGES: Record<WarningCode, string>`.
  - `DateChips({ value, onChange, today })`.
  - `TransactionForm({ mode: 'expense' | 'income', preferCard?, presetCardId?, edit?, onDone })`, `TransferForm({ edit?, onDone })`, `PayCardForm({ cardId?, edit?, onDone })`, `PayLoanForm({ debtId?, edit?, onDone })`.
  - `NeedsAccount` (aviso cuando no hay cuentas activas).
  - Claves de `localStorage`: `fz:lastSource` (`{ kind: 'account' | 'card'; id }`), `fz:categoryUse` (`Record<categoryId, number>`).

- [ ] **Step 1: Escribir el test que falla**

`apps/web/src/features/quick-add/TransactionForm.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { TransactionForm } from './TransactionForm';

const accounts = [
  { id: 'a1', name: 'Nequi', type: 'DIGITAL_WALLET', institution: null, initialBalance: 0, openingDate: '2026-10-01', icon: 'smartphone', color: '#7c3aed', isActive: true, sortOrder: 0, balance: 300_000 },
];
const cards = [
  { id: 'c1', name: 'Nu Crédito', isActive: true, debt: 0, available: 5_000_000, creditLimit: 5_000_000, color: '#820ad1', icon: 'credit-card' },
];
const categories = [
  { id: 'k1', name: 'Alimentación', kind: 'EXPENSE', parentId: null, bucket: 'OBLIGATIONS', icon: 'utensils', color: '#f97316', isSystem: false, systemKey: null, isActive: true, sortOrder: 1 },
  { id: 'k2', name: 'Salario', kind: 'INCOME', parentId: null, bucket: null, icon: 'briefcase', color: '#16a34a', isSystem: false, systemKey: null, isActive: true, sortOrder: 2 },
  { id: 'k3', name: 'Ajuste de saldo', kind: 'EXPENSE', parentId: null, bucket: 'OTHER', icon: 'scale', color: '#94a3b8', isSystem: true, systemKey: 'ADJUSTMENT_EXPENSE', isActive: true, sortOrder: 3 },
];

let posted: unknown[] = [];
let release: () => void = () => undefined;

function setup(slowSave = false) {
  posted = [];
  return mockApi({
    'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
    'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
    'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
    'GET /categories': () => ({ status: 200, body: { items: categories } }),
    'POST /transactions': async (body) => {
      posted.push(body);
      if (slowSave) await new Promise<void>((resolve) => (release = resolve));
      return { status: 201, body: { transaction: { id: 't1' }, warnings: [] } };
    },
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('TransactionForm (expense)', () => {
  it('saves an expense paid from an account in a few taps', async () => {
    setup();
    const onDone = vi.fn();
    renderWithProviders(<TransactionForm mode="expense" onDone={onDone} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '25000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    expect(screen.queryByRole('radio', { name: /Ajuste de saldo/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(posted[0]).toMatchObject({ type: 'EXPENSE', amount: 25000, accountId: 'a1', categoryId: 'k1', date: expect.any(String) });
  });

  it('becomes a card purchase with installments when a card is chosen', async () => {
    setup();
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '1200000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    expect(screen.queryByLabelText('Cuotas')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Nu Crédito/ }));
    const installments = screen.getByLabelText('Cuotas');
    await userEvent.clear(installments);
    await userEvent.type(installments, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ type: 'CARD_PURCHASE', amount: 1_200_000, creditCardId: 'c1', installments: 12 });
    expect(posted[0]).not.toHaveProperty('accountId');
  });

  it('requires amount and category before saving', async () => {
    setup();
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe un valor mayor que $0')).toBeInTheDocument();
    expect(screen.getByText('Elige una categoría')).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it('disables Guardar while saving so a double tap creates one movement (review focus #1)', async () => {
    setup(true);
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '5000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    const save = screen.getByRole('button', { name: 'Guardar' });
    await userEvent.dblClick(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(posted).toHaveLength(1);
    release();
  });
});

describe('TransactionForm (income)', () => {
  it('only offers accounts and income categories', async () => {
    setup();
    renderWithProviders(<TransactionForm mode="income" onDone={() => undefined} />);
    await screen.findByRole('radio', { name: /Salario/ });
    expect(screen.queryByRole('radio', { name: /Alimentación/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Nu Crédito/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -w @finanzas/web -- TransactionForm`
Expected: FAIL — `./TransactionForm` no existe.

- [ ] **Step 3: Guardado común, avisos y fechas**

`apps/web/src/features/quick-add/warnings.ts`:
```ts
import type { WarningCode } from '@finanzas/shared';

export const WARNING_MESSAGES: Record<WarningCode, string> = {
  NEGATIVE_BALANCE: 'Ojo: la cuenta quedó con saldo negativo. ¿Falta registrar un ingreso o una transferencia?',
  OVER_CREDIT_LIMIT: 'La compra supera el cupo disponible de la tarjeta. Revisa el cupo registrado.',
  BEFORE_OPENING_DATE: 'La fecha es anterior a la apertura de la cuenta: su saldo inicial ya podría incluir este movimiento.',
};
```

`apps/web/src/features/quick-add/useSaveTransaction.ts`:
```ts
import type { TransactionResultDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { invalidateFinance } from '../../lib/queries';
import { WARNING_MESSAGES } from './warnings';

export interface SaveRequest {
  path: string;
  method: 'POST' | 'PUT';
  body: unknown;
}

export interface SaveCallbacks {
  onSuccess?: () => void;
  onError?: (error: ApiError) => void;
}

/**
 * `submit` ignora llamadas mientras hay un guardado en curso: un doble toque nunca crea dos movimientos,
 * aunque React todavía no haya re-renderizado el botón como deshabilitado.
 */
export function useSaveTransaction(successMessage = 'Guardado') {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inFlight = useRef(false);
  const { mutate, isPending } = useMutation<TransactionResultDTO, ApiError, SaveRequest>({
    mutationFn: ({ path, method, body }) =>
      method === 'POST' ? api.post<TransactionResultDTO>(path, body) : api.put<TransactionResultDTO>(path, body),
    onSuccess: async (result) => {
      await invalidateFinance(queryClient);
      toast.show({ message: successMessage });
      for (const code of result.warnings ?? []) toast.show({ message: WARNING_MESSAGES[code], tone: 'warning' });
    },
  });

  const submit = useCallback(
    (request: SaveRequest, callbacks: SaveCallbacks = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      mutate(request, {
        onSuccess: () => callbacks.onSuccess?.(),
        onError: (error) => callbacks.onError?.(error),
        onSettled: () => {
          inFlight.current = false;
        },
      });
    },
    [mutate],
  );

  return { submit, isPending };
}
```

`apps/web/src/features/quick-add/DateChips.tsx`:
```tsx
import { addDays, type IsoDate } from '@finanzas/shared';
import { Chips } from '../../components/ui/Chips';
import { TextInput } from '../../components/ui/Field';

export function DateChips({ value, onChange, today }: { value: IsoDate; onChange: (d: IsoDate) => void; today: IsoDate }) {
  const yesterday = addDays(today, -1);
  const choice = value === today ? 'today' : value === yesterday ? 'yesterday' : 'other';
  return (
    <div className="space-y-2">
      <Chips
        ariaLabel="Fecha"
        value={choice}
        onChange={(c) => onChange(c === 'today' ? today : c === 'yesterday' ? yesterday : addDays(today, -2))}
        options={[
          { value: 'today', label: 'Hoy' },
          { value: 'yesterday', label: 'Ayer' },
          { value: 'other', label: 'Otra' },
        ]}
      />
      {choice === 'other' && (
        <TextInput type="date" aria-label="Fecha del movimiento" max={today} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
      )}
    </div>
  );
}
```

`apps/web/src/features/quick-add/NeedsAccount.tsx`:
```tsx
import { Link } from 'react-router';
import { EmptyState } from '../../components/ui/EmptyState';

export function NeedsAccount({ onNavigate }: { onNavigate: () => void }) {
  return (
    <EmptyState
      title="Primero crea una cuenta"
      description="Registra dónde tienes tu dinero (efectivo, banco o billetera) para poder anotar movimientos."
      action={
        <Link to="/accounts" onClick={onNavigate} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-medium text-primary-fg">
          Ir a Mis cuentas
        </Link>
      }
    />
  );
}
```

- [ ] **Step 4: Formulario de gasto / compra con tarjeta / ingreso**

`apps/web/src/features/quick-add/TransactionForm.tsx`:
```tsx
import { PAYMENT_METHOD_LABELS, type CategoryDTO, type PaymentMethod, type TransactionDTO } from '@finanzas/shared';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { Field, Select, TextArea, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { PageSpinner } from '../../components/ui/Spinner';
import { Icon } from '../../lib/icons';
import { useAccounts, useCards, useCategories } from '../../lib/queries';
import { readJSON, writeJSON } from '../../lib/storage';
import { useToday } from '../auth/useAuth';
import { DateChips } from './DateChips';
import { NeedsAccount } from './NeedsAccount';
import { useSaveTransaction } from './useSaveTransaction';

type Source = { kind: 'account' | 'card'; id: string };

interface Props {
  mode: 'expense' | 'income';
  /** "Compra con tarjeta" desde el menú: preselecciona la primera tarjeta. */
  preferCard?: boolean;
  presetCardId?: string;
  edit?: TransactionDTO;
  onDone: () => void;
}

const LAST_SOURCE = 'fz:lastSource';
const CATEGORY_USE = 'fz:categoryUse';
const sourceKey = (s: Source) => `${s.kind}:${s.id}`;

function initialSource(edit: TransactionDTO | undefined, presetCardId: string | undefined): Source | null {
  if (edit?.creditCard) return { kind: 'card', id: edit.creditCard.id };
  if (edit?.account) return { kind: 'account', id: edit.account.id };
  if (presetCardId) return { kind: 'card', id: presetCardId };
  return null;
}

export function TransactionForm({ mode, preferCard, presetCardId, edit, onDone }: Props) {
  const today = useToday();
  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories();
  const save = useSaveTransaction(edit ? 'Movimiento actualizado' : mode === 'income' ? 'Ingreso guardado' : 'Gasto guardado');

  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(edit?.category?.id ?? null);
  const [chosenSource, setChosenSource] = useState<Source | null>(initialSource(edit, presetCardId));
  const [date, setDate] = useState(edit?.date ?? today);
  const [description, setDescription] = useState(edit?.description ?? '');
  const [payee, setPayee] = useState(edit?.payee ?? '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [tags, setTags] = useState(edit?.tags.join(', ') ?? '');
  const [installments, setInstallments] = useState(String(edit?.installments ?? 1));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(edit?.paymentMethod ?? '');
  const [showMore, setShowMore] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const kind = mode === 'income' ? 'INCOME' : 'EXPENSE';
  const activeAccounts = (accounts.data ?? []).filter((a) => a.isActive || a.id === edit?.account?.id);
  const activeCards = mode === 'expense' ? (cards.data ?? []).filter((c) => c.isActive || c.id === edit?.creditCard?.id) : [];

  const allSources = [
    ...activeAccounts.map((a) => ({ source: { kind: 'account', id: a.id } as Source, label: a.name, icon: a.icon })),
    ...activeCards.map((c) => ({ source: { kind: 'card', id: c.id } as Source, label: c.name, icon: 'credit-card' })),
  ];
  // En edición el tipo no cambia: un gasto con cuenta no puede volverse compra con tarjeta, ni al revés.
  const sources = edit ? allSources.filter((s) => s.source.kind === (edit.type === 'CARD_PURCHASE' ? 'card' : 'account')) : allSources;

  const remembered = readJSON<Source | null>(LAST_SOURCE, null);
  const isAvailable = (s: Source | null): s is Source => !!s && sources.some((o) => sourceKey(o.source) === sourceKey(s));
  const firstCard = sources.find((s) => s.source.kind === 'card')?.source ?? null;
  const source =
    (isAvailable(chosenSource) ? chosenSource : null) ??
    (preferCard ? firstCard : null) ??
    (isAvailable(remembered) ? remembered : null) ??
    sources[0]?.source ??
    null;

  const usage = readJSON<Record<string, number>>(CATEGORY_USE, {});
  const kindCategories = (categories.data ?? [])
    .filter((c) => c.kind === kind && !c.isSystem && (c.isActive || c.id === edit?.category?.id))
    .sort((a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.sortOrder - b.sortOrder);
  const roots = kindCategories.filter((c) => !c.parentId);
  const selected = kindCategories.find((c) => c.id === categoryId);
  const rootId = selected?.parentId ?? selected?.id ?? null;
  const children = kindCategories.filter((c) => c.parentId && c.parentId === rootId);
  const visibleRoots = showAllCategories ? roots : roots.slice(0, 8);
  if (rootId && !visibleRoots.some((c) => c.id === rootId)) {
    const root = roots.find((c) => c.id === rootId);
    if (root) visibleRoots.push(root);
  }

  if (accounts.isPending || categories.isPending || (mode === 'expense' && cards.isPending)) return <PageSpinner />;
  if (activeAccounts.length === 0 && activeCards.length === 0) return <NeedsAccount onNavigate={onDone} />;

  const isCard = source?.kind === 'card';
  const categoryOption = (c: CategoryDTO) => ({ value: c.id, label: c.name, icon: <Icon name={c.icon} size={16} /> });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!amount) next.amount = 'Escribe un valor mayor que $0';
    if (!categoryId) next.categoryId = 'Elige una categoría';
    if (!source) next.source = mode === 'income' ? 'Elige la cuenta donde lo recibiste' : 'Elige con qué pagaste';
    const n = Number(installments);
    if (isCard && (!Number.isInteger(n) || n < 1 || n > 48)) next.installments = 'Entre 1 y 48 cuotas';
    setErrors(next);
    if (Object.keys(next).length > 0 || !source || !amount || !categoryId) return;

    const common = {
      amount,
      date,
      categoryId,
      description: description || null,
      notes: notes || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    const body =
      mode === 'income'
        ? { type: 'INCOME', ...common, accountId: source.id, payee: payee || null }
        : isCard
          ? { type: 'CARD_PURCHASE', ...common, creditCardId: source.id, installments: n }
          : { type: 'EXPENSE', ...common, accountId: source.id, paymentMethod: paymentMethod || null };

    save.submit(
      edit ? { path: `/transactions/${edit.id}`, method: 'PUT', body } : { path: '/transactions', method: 'POST', body },
      {
        onSuccess: () => {
          writeJSON(LAST_SOURCE, source);
          writeJSON(CATEGORY_USE, { ...usage, [categoryId]: (usage[categoryId] ?? 0) + 1 });
          onDone();
        },
        onError: (err) => setErrors(err.fields ?? { _: err.message }),
      },
    );
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <MoneyInput aria-label="Valor" size="lg" autoFocus={!edit} value={amount} onChange={setAmount} />
        {errors.amount && <p className="mt-1 text-center text-sm text-negative">{errors.amount}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Categoría</p>
        <Chips ariaLabel="Categoría" value={rootId} onChange={setCategoryId} options={visibleRoots.map(categoryOption)} />
        {roots.length > 8 && !showAllCategories && (
          <button type="button" className="text-sm text-primary" onClick={() => setShowAllCategories(true)}>
            Ver todas las categorías
          </button>
        )}
        {children.length > 0 && (
          <Chips ariaLabel="Subcategoría" value={selected?.parentId ? selected.id : null} onChange={setCategoryId} options={children.map(categoryOption)} />
        )}
        {errors.categoryId && <p className="text-sm text-negative">{errors.categoryId}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{mode === 'income' ? 'Recibido en' : 'Pagado con'}</p>
        <Chips
          ariaLabel={mode === 'income' ? 'Cuenta' : 'Medio de pago'}
          value={source ? sourceKey(source) : null}
          onChange={(key) => setChosenSource(sources.find((s) => sourceKey(s.source) === key)?.source ?? null)}
          options={sources.map((s) => ({ value: sourceKey(s.source), label: s.label, icon: <Icon name={s.icon} size={16} /> }))}
        />
        {errors.source && <p className="text-sm text-negative">{errors.source}</p>}
        {errors.accountId && <p className="text-sm text-negative">{errors.accountId}</p>}
        {errors.creditCardId && <p className="text-sm text-negative">{errors.creditCardId}</p>}
      </div>

      {isCard && (
        <Field label="Cuotas" htmlFor="installments" error={errors.installments} hint="El gasto se cuenta completo hoy; las cuotas solo estiman tu pago mensual.">
          <TextInput id="installments" inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))} />
        </Field>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Fecha</p>
        <DateChips value={date} onChange={setDate} today={today} />
        {errors.date && <p className="text-sm text-negative">{errors.date}</p>}
      </div>

      <Field label="Descripción (opcional)" htmlFor="description">
        <TextInput id="description" maxLength={140} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <button type="button" onClick={() => setShowMore((v) => !v)} className="flex items-center gap-1 text-sm text-primary">
        Más opciones <ChevronDown size={16} className={showMore ? 'rotate-180' : ''} />
      </button>
      {showMore && (
        <div className="space-y-4">
          {mode === 'income' && (
            <Field label="Fuente (empresa, cliente…)" htmlFor="payee">
              <TextInput id="payee" maxLength={80} value={payee} onChange={(e) => setPayee(e.target.value)} />
            </Field>
          )}
          {mode === 'expense' && !isCard && (
            <Field label="Método de pago" htmlFor="method" hint="Opcional: por defecto se usa el tipo de cuenta.">
              <Select id="method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}>
                <option value="">Según la cuenta</option>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Etiquetas" htmlFor="tags" hint="Separadas por comas, por ejemplo: trabajo, viaje">
            <TextInput id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field label="Notas" htmlFor="notes">
            <TextArea id="notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      )}

      {errors._ && <p role="alert" className="text-sm text-negative">{errors._}</p>}
      <div className="sticky bottom-0 -mx-4 bg-surface px-4 pt-2 pb-1">
        <Button type="submit" size="lg" loading={save.isPending}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Transferencia, pagar tarjeta y pagar préstamo**

`apps/web/src/features/quick-add/TransferForm.tsx`:
```tsx
import { ACCOUNT_TYPE_LABELS, type TransactionDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { PageSpinner } from '../../components/ui/Spinner';
import { useAccounts } from '../../lib/queries';
import { useToday } from '../auth/useAuth';
import { DateChips } from './DateChips';
import { NeedsAccount } from './NeedsAccount';
import { useSaveTransaction } from './useSaveTransaction';

export function TransferForm({ edit, onDone }: { edit?: TransactionDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const save = useSaveTransaction(edit ? 'Transferencia actualizada' : 'Transferencia guardada');
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [from, setFrom] = useState(edit?.account?.id ?? '');
  const [to, setTo] = useState(edit?.toAccount?.id ?? '');
  const [date, setDate] = useState(edit?.date ?? today);
  const [description, setDescription] = useState(edit?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (accounts.isPending) return <PageSpinner />;
  const list = (accounts.data ?? []).filter((a) => a.isActive || a.id === edit?.account?.id || a.id === edit?.toAccount?.id);
  if (list.length < 2) return <NeedsAccount onNavigate={onDone} />;

  const submit = () => {
    const next: Record<string, string> = {};
    if (!amount) next.amount = 'Escribe un valor mayor que $0';
    if (!from) next.accountId = 'Elige la cuenta de origen';
    if (!to) next.toAccountId = 'Elige la cuenta de destino';
    if (from && from === to) next.toAccountId = 'La cuenta destino debe ser distinta de la de origen';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body = { amount, date, accountId: from, toAccountId: to, description: description || null };
    save.submit(
      edit
        ? { path: `/transactions/${edit.id}`, method: 'PUT', body: { type: 'TRANSFER', ...body, goalId: edit.goalId, tags: edit.tags } }
        : { path: '/transfers', method: 'POST', body },
      { onSuccess: onDone, onError: (err) => setErrors(err.fields ?? { _: err.message }) },
    );
  };

  const options = list.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
    </option>
  ));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <MoneyInput aria-label="Valor" size="lg" autoFocus={!edit} value={amount} onChange={setAmount} />
        {errors.amount && <p className="mt-1 text-center text-sm text-negative">{errors.amount}</p>}
      </div>
      <Field label="Desde" htmlFor="from" error={errors.accountId}>
        <Select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {options}
        </Select>
      </Field>
      <Field label="Hacia" htmlFor="to" error={errors.toAccountId} hint="Mover dinero entre tus cuentas no es un gasto. Si va a una cuenta de ahorro, cuenta como ahorro.">
        <Select id="to" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {options}
        </Select>
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Fecha</p>
        <DateChips value={date} onChange={setDate} today={today} />
      </div>
      <Field label="Descripción (opcional)" htmlFor="tdesc">
        <TextInput id="tdesc" maxLength={140} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {errors._ && <p role="alert" className="text-sm text-negative">{errors._}</p>}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar
      </Button>
    </form>
  );
}
```

`apps/web/src/features/quick-add/PayCardForm.tsx`:
```tsx
import type { TransactionDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { PageSpinner } from '../../components/ui/Spinner';
import { formatShortDate } from '../../lib/format';
import { useAccounts, useCards } from '../../lib/queries';
import { useToday } from '../auth/useAuth';
import { DateChips } from './DateChips';
import { NeedsAccount } from './NeedsAccount';
import { useSaveTransaction } from './useSaveTransaction';

export function PayCardForm({ cardId, edit, onDone }: { cardId?: string; edit?: TransactionDTO; onDone: () => void }) {
  const today = useToday();
  const cards = useCards();
  const accounts = useAccounts();
  const save = useSaveTransaction(edit ? 'Pago actualizado' : 'Pago de tarjeta registrado');
  const [selectedCard, setSelectedCard] = useState(edit?.creditCard?.id ?? cardId ?? '');
  const [accountId, setAccountId] = useState(edit?.account?.id ?? '');
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [date, setDate] = useState(edit?.date ?? today);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (cards.isPending || accounts.isPending) return <PageSpinner />;
  const cardList = (cards.data ?? []).filter((c) => c.isActive || c.id === edit?.creditCard?.id);
  const accountList = (accounts.data ?? []).filter((a) => a.isActive || a.id === edit?.account?.id);
  if (cardList.length === 0) return <EmptyState title="No tienes tarjetas registradas" description="Agrégalas en Más → Tarjetas." />;
  if (accountList.length === 0) return <NeedsAccount onNavigate={onDone} />;

  const card = cardList.find((c) => c.id === (selectedCard || cardList[0]!.id))!;
  // Al editar, la deuda mostrada no debe descontar el propio pago.
  const debt = card.debt + (edit?.creditCard?.id === card.id ? edit.amount : 0);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!amount) next.amount = 'Escribe el valor a pagar';
    else if (amount > debt) next.amount = 'El pago no puede superar la deuda de la tarjeta';
    if (!accountId) next.accountId = 'Elige la cuenta desde la que pagas';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body = { amount, date, accountId, description: null };
    save.submit(
      edit
        ? { path: `/transactions/${edit.id}`, method: 'PUT', body: { type: 'CARD_PAYMENT', ...body, creditCardId: card.id, tags: edit.tags, description: edit.description } }
        : { path: `/credit-cards/${card.id}/payment`, method: 'POST', body },
      { onSuccess: onDone, onError: (err) => setErrors(err.fields ?? { _: err.message }) },
    );
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {cardList.length > 1 && (
        <Chips ariaLabel="Tarjeta" value={card.id} onChange={setSelectedCard} options={cardList.map((c) => ({ value: c.id, label: c.name }))} />
      )}
      <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
        <div>
          <dt className="text-muted">Deuda actual</dt>
          <dd className="text-lg font-semibold"><Amount value={Math.max(debt, 0)} tone="debt" /></dd>
        </div>
        <div>
          <dt className="text-muted">Pago del mes</dt>
          <dd className="text-lg font-semibold"><Amount value={card.amountDue} /></dd>
          {card.amountDue > 0 && <dd className="text-xs text-muted">vence {formatShortDate(card.dueDate)}</dd>}
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={card.amountDue <= 0} onClick={() => setAmount(card.amountDue)}>
          Pago del mes
        </Button>
        <Button size="sm" variant="secondary" disabled={debt <= 0} onClick={() => setAmount(debt)}>
          Pago total
        </Button>
      </div>
      <div>
        <MoneyInput aria-label="Valor del pago" size="lg" value={amount} onChange={setAmount} />
        {errors.amount && <p className="mt-1 text-center text-sm text-negative">{errors.amount}</p>}
      </div>
      <Field label="Pagar desde" htmlFor="payFrom" error={errors.accountId}>
        <Select id="payFrom" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {accountList.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Fecha</p>
        <DateChips value={date} onChange={setDate} today={today} />
      </div>
      <p className="text-xs text-muted">Este pago baja tu cuenta y tu deuda. No es un gasto nuevo: las compras ya se contaron cuando las hiciste.</p>
      {errors._ && <p role="alert" className="text-sm text-negative">{errors._}</p>}
      <Button type="submit" size="lg" loading={save.isPending}>
        Pagar tarjeta
      </Button>
    </form>
  );
}
```

`apps/web/src/features/quick-add/PayLoanForm.tsx`:
```tsx
import type { TransactionDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { PageSpinner } from '../../components/ui/Spinner';
import { useAccounts, useDebts } from '../../lib/queries';
import { useToday } from '../auth/useAuth';
import { DateChips } from './DateChips';
import { NeedsAccount } from './NeedsAccount';
import { useSaveTransaction } from './useSaveTransaction';

export function PayLoanForm({ debtId, edit, onDone }: { debtId?: string; edit?: TransactionDTO; onDone: () => void }) {
  const today = useToday();
  const debts = useDebts();
  const accounts = useAccounts();
  const save = useSaveTransaction(edit ? 'Pago actualizado' : 'Pago de préstamo registrado');
  const [selected, setSelected] = useState(edit?.debt?.id ?? debtId ?? '');
  const [accountId, setAccountId] = useState(edit?.account?.id ?? '');
  const [principal, setPrincipal] = useState<number | null>(edit?.amount ?? null);
  const [interest, setInterest] = useState<number | null>(edit?.interest || null);
  const [date, setDate] = useState(edit?.date ?? today);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (debts.isPending || accounts.isPending) return <PageSpinner />;
  const debtList = (debts.data ?? []).filter((d) => d.isActive || d.id === edit?.debt?.id);
  const accountList = (accounts.data ?? []).filter((a) => a.isActive || a.id === edit?.account?.id);
  if (debtList.length === 0) return <EmptyState title="No tienes préstamos registrados" description="Agrégalos en Más → Préstamos." />;
  if (accountList.length === 0) return <NeedsAccount onNavigate={onDone} />;
  const debt = debtList.find((d) => d.id === (selected || debtList[0]!.id))!;

  const submit = () => {
    const next: Record<string, string> = {};
    if (!principal) next.amount = 'Escribe el abono a capital';
    if (!accountId) next.accountId = 'Elige la cuenta desde la que pagas';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    save.submit(
      edit
        ? {
            path: `/transactions/${edit.id}`,
            method: 'PUT',
            body: { type: 'DEBT_PAYMENT', amount: principal, interest: interest ?? 0, date, accountId, debtId: debt.id, description: edit.description, tags: edit.tags },
          }
        : { path: `/debts/${debt.id}/payments`, method: 'POST', body: { accountId, principal, interest: interest ?? 0, date } },
      { onSuccess: onDone, onError: (err) => setErrors(err.fields ?? { _: err.message }) },
    );
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {debtList.length > 1 && (
        <Chips ariaLabel="Préstamo" value={debt.id} onChange={setSelected} options={debtList.map((d) => ({ value: d.id, label: d.name }))} />
      )}
      <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
        <div>
          <dt className="text-muted">Saldo</dt>
          <dd className="text-lg font-semibold"><Amount value={debt.balance} tone="debt" /></dd>
        </div>
        <div>
          <dt className="text-muted">Cuota pendiente</dt>
          <dd className="text-lg font-semibold"><Amount value={debt.installmentDue} /></dd>
        </div>
      </dl>
      <Field label="Abono a capital" htmlFor="principal" error={errors.amount} hint="Baja el saldo del préstamo. No es un gasto.">
        <MoneyInput id="principal" value={principal} onChange={setPrincipal} />
      </Field>
      <Field label="Intereses (opcional)" htmlFor="interest" hint="Se registran como gasto en Intereses y comisiones.">
        <MoneyInput id="interest" value={interest} onChange={setInterest} />
      </Field>
      <Field label="Pagar desde" htmlFor="loanFrom" error={errors.accountId}>
        <Select id="loanFrom" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {accountList.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Fecha</p>
        <DateChips value={date} onChange={setDate} today={today} />
      </div>
      {errors._ && <p role="alert" className="text-sm text-negative">{errors._}</p>}
      <Button type="submit" size="lg" loading={save.isPending}>
        Registrar pago
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Reemplazar `QuickAddSheets.tsx`**

```tsx
import type { TransactionDTO } from '@finanzas/shared';
import { Sheet } from '../../components/ui/Sheet';
import { useDebts } from '../../lib/queries';
import { useQuickAdd, type QuickAddKind } from './QuickAddContext';
import { QuickAddMenu } from './QuickAddMenu';
import { PayCardForm } from './PayCardForm';
import { PayLoanForm } from './PayLoanForm';
import { TransactionForm } from './TransactionForm';
import { TransferForm } from './TransferForm';

const TITLES: Record<QuickAddKind, string> = {
  menu: '¿Qué quieres registrar?',
  expense: 'Nuevo gasto',
  income: 'Nuevo ingreso',
  transfer: 'Transferir dinero',
  'card-purchase': 'Compra con tarjeta',
  'card-payment': 'Pagar tarjeta',
  'loan-payment': 'Pagar préstamo',
};

export function kindForTransaction(t: TransactionDTO): QuickAddKind {
  switch (t.type) {
    case 'INCOME':
      return 'income';
    case 'TRANSFER':
      return 'transfer';
    case 'CARD_PAYMENT':
      return 'card-payment';
    case 'DEBT_PAYMENT':
      return 'loan-payment';
    default:
      return 'expense';
  }
}

export function QuickAddSheets() {
  const { request, open, close } = useQuickAdd();
  const debts = useDebts();
  const kind = request?.kind;
  const edit = request?.edit;
  const title = edit ? `Editar ${TITLES[kind ?? 'expense'].replace(/^Nuevo |^Nueva /, '').toLowerCase()}` : TITLES[kind ?? 'menu'];

  return (
    <Sheet open={request !== null} onOpenChange={(o) => !o && close()} title={title}>
      {kind === 'menu' && <QuickAddMenu hasDebts={(debts.data ?? []).some((d) => d.isActive)} onPick={(k) => open({ kind: k })} />}
      {kind === 'expense' && <TransactionForm key="expense" mode="expense" edit={edit} onDone={close} />}
      {kind === 'card-purchase' && <TransactionForm key="card" mode="expense" preferCard presetCardId={request?.cardId} edit={edit} onDone={close} />}
      {kind === 'income' && <TransactionForm key="income" mode="income" edit={edit} onDone={close} />}
      {kind === 'transfer' && <TransferForm edit={edit} onDone={close} />}
      {kind === 'card-payment' && <PayCardForm cardId={request?.cardId} edit={edit} onDone={close} />}
      {kind === 'loan-payment' && <PayLoanForm debtId={request?.debtId} edit={edit} onDone={close} />}
    </Sheet>
  );
}
```

- [ ] **Step 7: Verificar**

Run: `npm test -w @finanzas/web && npm run typecheck -w @finanzas/web && npm run lint`
Expected: PASS de los 5 tests de `TransactionForm.test.tsx` y de los anteriores.

Run (API + web en desarrollo, usuario demo, viewport 360 px): registrar un gasto de $25.000 en Alimentación con Nequi (medir: menos de 10 segundos), una compra con Nu Crédito a 3 cuotas, una transferencia Bancolombia → Bolsillo ahorro y un pago de tarjeta con "Pago del mes".
Expected: cada uno muestra el aviso "Guardado"; el dashboard se actualiza solo; el pago de tarjeta no cambia los gastos del mes; la transferencia a ahorro aumenta "Ahorro" y no "Gastos".

---

### Task 20: Historial de movimientos — lista por día, búsqueda, filtros, detalle, edición y borrado

**Files:**
- Create: `apps/web/src/features/transactions/describe.ts`, `apps/web/src/features/transactions/TransactionRow.tsx`, `apps/web/src/features/transactions/filters.ts`, `apps/web/src/features/transactions/FiltersSheet.tsx`, `apps/web/src/features/transactions/TransactionDetailSheet.tsx`, `apps/web/src/features/transactions/TransactionsPage.tsx`
- Modify: `apps/web/src/lib/icons.tsx` (íconos `arrow-left-right`, `receipt`), `apps/web/src/app/router.tsx` (ruta `/transactions`)
- Test: `apps/web/src/features/transactions/TransactionRow.test.tsx`, `apps/web/src/features/transactions/filters.test.ts`

**Interfaces:**
- Consumes: `kindForTransaction` y `useQuickAdd` (Tasks 18–19); `useAccounts`, `useCards`, `useCategories`, `invalidateFinance`, `qk` (Task 17); `useDebounced`, `dayHeading`, UI (Task 16).
- Produces:
  - `describeTransaction(t): { title, subtitle, tone: AmountTone, icon, color, typeLabel }`.
  - `TransactionRow({ transaction, onSelect })`.
  - `TxFilters`, `EMPTY_FILTERS`, `activeFilterCount(f)`, `filtersToParams(f, q, today): URLSearchParams`, `groupByDate(items)`.
  - `FiltersSheet({ open, onOpenChange, value, onApply })`, `TransactionDetailSheet({ transaction, onClose })`, `TransactionsPage`.

- [ ] **Step 1: Escribir tests que fallan**

`apps/web/src/features/transactions/TransactionRow.test.tsx`:
```tsx
import type { TransactionDTO } from '@finanzas/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransactionRow } from './TransactionRow';

const ref = (id: string, name: string) => ({ id, name, icon: 'wallet', color: '#123456' });
const base: TransactionDTO = {
  id: 't1',
  type: 'EXPENSE',
  amount: 25_000,
  date: '2026-10-06',
  description: null,
  payee: null,
  notes: null,
  account: null,
  toAccount: null,
  creditCard: null,
  debt: null,
  category: null,
  goalId: null,
  installments: null,
  paymentMethod: null,
  method: null,
  parentId: null,
  interest: 0,
  tags: [],
  createdAt: '2026-10-06T15:00:00.000Z',
};

describe('TransactionRow', () => {
  it('shows a card payment as a neutral payment, never as an expense (review focus #4)', () => {
    render(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{ ...base, type: 'CARD_PAYMENT', amount: 500_000, account: { ...ref('a1', 'Bancolombia'), type: 'BANK' }, creditCard: ref('c1', 'Nu Crédito') }}
      />,
    );
    expect(screen.getByText('Pago tarjeta')).toBeInTheDocument();
    expect(screen.getByText('Bancolombia → Nu Crédito')).toBeInTheDocument();
    const amount = screen.getByText('$500.000');
    expect(amount).not.toHaveClass('text-negative');
    expect(screen.queryByText('-$500.000')).not.toBeInTheDocument();
  });

  it('shows expenses in red with a minus sign and their category and account', () => {
    render(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{
          ...base,
          description: 'Almuerzo',
          account: { ...ref('a2', 'Nequi'), type: 'DIGITAL_WALLET' },
          category: { ...ref('k1', 'Alimentación'), kind: 'EXPENSE', parentId: null },
        }}
      />,
    );
    expect(screen.getByText('Almuerzo')).toBeInTheDocument();
    expect(screen.getByText('Alimentación · Nequi')).toBeInTheDocument();
    expect(screen.getByText('-$25.000')).toHaveClass('text-negative');
  });

  it('describes transfers, income and card purchases with installments', () => {
    const { rerender } = render(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{ ...base, type: 'TRANSFER', amount: 200_000, account: { ...ref('a1', 'Bancolombia'), type: 'BANK' }, toAccount: { ...ref('a2', 'Nequi'), type: 'DIGITAL_WALLET' } }}
      />,
    );
    expect(screen.getByText('Bancolombia → Nequi')).toBeInTheDocument();
    expect(screen.getByText('$200.000')).not.toHaveClass('text-negative');

    rerender(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{ ...base, type: 'INCOME', amount: 4_000_000, description: 'Salario', account: { ...ref('a1', 'Bancolombia'), type: 'BANK' } }}
      />,
    );
    expect(screen.getByText('+$4.000.000')).toHaveClass('text-positive');

    rerender(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{ ...base, type: 'CARD_PURCHASE', amount: 150_000, description: 'Amazon', installments: 3, creditCard: ref('c1', 'Nu Crédito') }}
      />,
    );
    expect(screen.getByText('Nu Crédito · 3 cuotas')).toBeInTheDocument();
    expect(screen.getByText('-$150.000')).toBeInTheDocument();
  });
});
```

`apps/web/src/features/transactions/filters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { activeFilterCount, EMPTY_FILTERS, filtersToParams, groupByDate } from './filters';

describe('filters', () => {
  it('builds the API query from the filters and search text', () => {
    const params = filtersToParams(
      { ...EMPTY_FILTERS, period: 'last-month', types: ['EXPENSE', 'CARD_PURCHASE'], accountId: 'a1', minAmount: 1000 },
      'almuerzo',
      '2026-10-06',
    );
    expect(Object.fromEntries(params)).toEqual({
      limit: '30',
      from: '2026-09-01',
      to: '2026-09-30',
      type: 'EXPENSE,CARD_PURCHASE',
      accountId: 'a1',
      minAmount: '1000',
      q: 'almuerzo',
    });
    expect(activeFilterCount({ ...EMPTY_FILTERS, period: 'this-month', tag: 'viaje' })).toBe(2);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('groups movements by date keeping order', () => {
    const groups = groupByDate([
      { id: '1', date: '2026-10-06' },
      { id: '2', date: '2026-10-06' },
      { id: '3', date: '2026-10-05' },
    ]);
    expect(groups.map((g) => [g.date, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-06', ['1', '2']],
      ['2026-10-05', ['3']],
    ]);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- TransactionRow filters`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Íconos adicionales**

En `apps/web/src/lib/icons.tsx` agregar `ArrowLeftRight` y `Receipt` a los imports de `lucide-react` y al mapa:
```tsx
  'arrow-left-right': ArrowLeftRight,
  receipt: Receipt,
```

- [ ] **Step 4: Descripción y fila de movimiento**

`apps/web/src/features/transactions/describe.ts`:
```ts
import { formatCOP, TRANSACTION_TYPE_LABELS, type TransactionDTO } from '@finanzas/shared';
import type { AmountTone } from '../../components/ui/Amount';

export interface Described {
  title: string;
  subtitle: string;
  tone: AmountTone;
  icon: string;
  color: string;
  typeLabel: string;
}

const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(' · ');

export function describeTransaction(t: TransactionDTO): Described {
  const category = t.category?.name;
  const typeLabel = TRANSACTION_TYPE_LABELS[t.type];
  switch (t.type) {
    // Si no hay descripción, la categoría ya es el título y no se repite en el subtítulo.
    case 'INCOME':
      return {
        title: t.description ?? category ?? typeLabel,
        subtitle: join(t.description ? category : null, t.account?.name),
        tone: 'income',
        icon: t.category?.icon ?? 'circle-plus',
        color: t.category?.color ?? '#15803d',
        typeLabel,
      };
    case 'EXPENSE':
      return {
        title: t.description ?? category ?? typeLabel,
        subtitle: join(t.parentId ? 'Intereses de préstamo' : t.description ? category : null, t.account?.name),
        tone: 'expense',
        icon: t.category?.icon ?? 'receipt',
        color: t.category?.color ?? '#be123c',
        typeLabel,
      };
    case 'CARD_PURCHASE':
      return {
        title: t.description ?? category ?? typeLabel,
        subtitle: join(t.description ? category : null, t.creditCard?.name, (t.installments ?? 1) > 1 && `${t.installments} cuotas`),
        tone: 'expense',
        icon: t.category?.icon ?? 'credit-card',
        color: t.category?.color ?? '#be123c',
        typeLabel,
      };
    case 'TRANSFER':
      return { title: t.description ?? 'Transferencia', subtitle: `${t.account?.name ?? '?'} → ${t.toAccount?.name ?? '?'}`, tone: 'neutral', icon: 'arrow-left-right', color: '#64748b', typeLabel };
    case 'CARD_PAYMENT':
      return { title: 'Pago tarjeta', subtitle: `${t.account?.name ?? '?'} → ${t.creditCard?.name ?? '?'}`, tone: 'neutral', icon: 'credit-card', color: '#64748b', typeLabel };
    case 'DEBT_PAYMENT':
      return {
        title: 'Pago préstamo',
        subtitle: join(`${t.account?.name ?? '?'} → ${t.debt?.name ?? '?'}`, t.interest > 0 && `+ intereses ${formatCOP(t.interest)}`),
        tone: 'neutral',
        icon: 'landmark',
        color: '#64748b',
        typeLabel,
      };
    case 'DEBT_DISBURSEMENT':
      return { title: 'Desembolso de préstamo', subtitle: `${t.debt?.name ?? '?'} → ${t.account?.name ?? '?'}`, tone: 'neutral', icon: 'landmark', color: '#64748b', typeLabel };
  }
}
```

Nota: en el test de compra con tarjeta la descripción es "Amazon" y no hay categoría, así que el subtítulo es `Nu Crédito · 3 cuotas`.

`apps/web/src/features/transactions/TransactionRow.tsx`:
```tsx
import type { TransactionDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Icon } from '../../lib/icons';
import { describeTransaction } from './describe';

export function TransactionRow({ transaction, onSelect }: { transaction: TransactionDTO; onSelect: (t: TransactionDTO) => void }) {
  const d = describeTransaction(transaction);
  return (
    <button type="button" onClick={() => onSelect(transaction)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: d.color }}>
        <Icon name={d.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{d.title}</span>
        <span className="block truncate text-xs text-muted">{d.subtitle}</span>
      </span>
      <Amount value={transaction.amount} tone={d.tone} className="shrink-0 font-semibold" />
    </button>
  );
}
```

- [ ] **Step 5: Filtros**

`apps/web/src/features/transactions/filters.ts`:
```ts
import { addMonths, endOfMonth, startOfMonth, type DerivedMethod, type IsoDate, type TransactionType } from '@finanzas/shared';

export interface TxFilters {
  period: 'all' | 'this-month' | 'last-month' | 'custom';
  from: IsoDate | '';
  to: IsoDate | '';
  types: TransactionType[];
  accountId: string;
  creditCardId: string;
  categoryId: string;
  tag: string;
  method: DerivedMethod | '';
  minAmount: number | null;
  maxAmount: number | null;
}

export const EMPTY_FILTERS: TxFilters = {
  period: 'all',
  from: '',
  to: '',
  types: [],
  accountId: '',
  creditCardId: '',
  categoryId: '',
  tag: '',
  method: '',
  minAmount: null,
  maxAmount: null,
};

export function activeFilterCount(f: TxFilters): number {
  return [
    f.period !== 'all',
    f.types.length > 0,
    !!f.accountId,
    !!f.creditCardId,
    !!f.categoryId,
    !!f.tag,
    !!f.method,
    f.minAmount !== null || f.maxAmount !== null,
  ].filter(Boolean).length;
}

function range(f: TxFilters, today: IsoDate): [string, string] {
  switch (f.period) {
    case 'this-month':
      return [startOfMonth(today), today];
    case 'last-month': {
      const previous = addMonths(startOfMonth(today), -1);
      return [previous, endOfMonth(previous)];
    }
    case 'custom':
      return [f.from, f.to];
    default:
      return ['', ''];
  }
}

/** Parámetros de la petición a la API (no se reflejan en la URL del navegador). */
export function filtersToParams(f: TxFilters, q: string, today: IsoDate): URLSearchParams {
  const params = new URLSearchParams({ limit: '30' });
  const [from, to] = range(f, today);
  const set = (key: string, value: string | number | null) => {
    if (value !== null && value !== '') params.set(key, String(value));
  };
  set('from', from);
  set('to', to);
  set('type', f.types.join(','));
  set('accountId', f.accountId);
  set('creditCardId', f.creditCardId);
  set('categoryId', f.categoryId);
  set('tag', f.tag);
  set('method', f.method);
  set('minAmount', f.minAmount);
  set('maxAmount', f.maxAmount);
  set('q', q);
  return params;
}

export function groupByDate<T extends { date: IsoDate }>(items: T[]): Array<{ date: IsoDate; items: T[] }> {
  const groups: Array<{ date: IsoDate; items: T[] }> = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}
```

`apps/web/src/features/transactions/FiltersSheet.tsx`:
```tsx
import { DERIVED_METHOD_LABELS, TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES, type DerivedMethod, type TagDTO, type TransactionType } from '@finanzas/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { qk, useAccounts, useCards, useCategories } from '../../lib/queries';
import { EMPTY_FILTERS, type TxFilters } from './filters';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: TxFilters;
  onApply: (filters: TxFilters) => void;
}

export function FiltersSheet({ open, onOpenChange, value, onApply }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Filtrar movimientos">
      {open && <FiltersForm value={value} onApply={(f) => { onApply(f); onOpenChange(false); }} />}
    </Sheet>
  );
}

function FiltersForm({ value, onApply }: { value: TxFilters; onApply: (f: TxFilters) => void }) {
  const [draft, setDraft] = useState(value);
  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories();
  const tags = useQuery({ queryKey: qk.tags, queryFn: () => api.get<{ items: TagDTO[] }>('/tags').then((r) => r.items) });
  const set = <K extends keyof TxFilters>(key: K, v: TxFilters[K]) => setDraft((d) => ({ ...d, [key]: v }));
  const toggleType = (t: TransactionType) =>
    set('types', draft.types.includes(t) ? draft.types.filter((x) => x !== t) : [...draft.types, t]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Periodo</p>
        <Chips
          ariaLabel="Periodo"
          value={draft.period}
          onChange={(p) => set('period', p)}
          options={[
            { value: 'all', label: 'Todo' },
            { value: 'this-month', label: 'Este mes' },
            { value: 'last-month', label: 'Mes anterior' },
            { value: 'custom', label: 'Personalizado' },
          ]}
        />
        {draft.period === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <TextInput type="date" aria-label="Desde" value={draft.from} onChange={(e) => set('from', e.target.value)} />
            <TextInput type="date" aria-label="Hasta" value={draft.to} onChange={(e) => set('to', e.target.value)} />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Tipo</p>
        <div className="flex flex-wrap gap-2">
          {TRANSACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={draft.types.includes(t)}
              onClick={() => toggleType(t)}
              className={cn(
                'min-h-11 rounded-full border px-3 text-sm',
                draft.types.includes(t) ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border',
              )}
            >
              {TRANSACTION_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <Field label="Cuenta" htmlFor="f-account">
        <Select id="f-account" value={draft.accountId} onChange={(e) => set('accountId', e.target.value)}>
          <option value="">Todas</option>
          {(accounts.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Tarjeta" htmlFor="f-card">
        <Select id="f-card" value={draft.creditCardId} onChange={(e) => set('creditCardId', e.target.value)}>
          <option value="">Todas</option>
          {(cards.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Categoría" htmlFor="f-category" hint="Incluye sus subcategorías.">
        <Select id="f-category" value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
          <option value="">Todas</option>
          {(categories.data ?? [])
            .filter((c) => !c.parentId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === 'INCOME' ? 'Ingreso · ' : ''}
                {c.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Etiqueta" htmlFor="f-tag">
        <Select id="f-tag" value={draft.tag} onChange={(e) => set('tag', e.target.value)}>
          <option value="">Todas</option>
          {(tags.data ?? []).map((t) => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Método de pago" htmlFor="f-method">
        <Select id="f-method" value={draft.method} onChange={(e) => set('method', e.target.value as DerivedMethod | '')}>
          <option value="">Todos</option>
          {Object.entries(DERIVED_METHOD_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Valor mínimo" htmlFor="f-min">
          <MoneyInput id="f-min" value={draft.minAmount} onChange={(v) => set('minAmount', v)} />
        </Field>
        <Field label="Valor máximo" htmlFor="f-max">
          <MoneyInput id="f-max" value={draft.maxAmount} onChange={(v) => set('maxAmount', v)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onApply(EMPTY_FILTERS)}>
          Limpiar
        </Button>
        <Button onClick={() => onApply(draft)}>Aplicar</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Detalle con editar y eliminar**

`apps/web/src/features/transactions/TransactionDetailSheet.tsx`:
```tsx
import { DERIVED_METHOD_LABELS, type TransactionDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Sheet } from '../../components/ui/Sheet';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { invalidateFinance } from '../../lib/queries';
import { useQuickAdd } from '../quick-add/QuickAddContext';
import { kindForTransaction } from '../quick-add/QuickAddSheets';
import { describeTransaction } from './describe';

export function TransactionDetailSheet({ transaction, onClose }: { transaction: TransactionDTO | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { open } = useQuickAdd();
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/transactions/${id}`),
    onSuccess: async () => {
      await invalidateFinance(queryClient);
      toast.show({ message: 'Movimiento eliminado' });
      onClose();
    },
    onError: (err) => toast.show({ message: err instanceof ApiError ? err.message : 'No se pudo eliminar', tone: 'error' }),
  });
  if (!transaction) return null;
  const d = describeTransaction(transaction);
  const rows: Array<[string, string | null | undefined]> = [
    ['Tipo', d.typeLabel],
    ['Fecha', formatDate(transaction.date)],
    ['Categoría', transaction.category?.name],
    ['Cuenta', transaction.account?.name],
    ['Cuenta destino', transaction.toAccount?.name],
    ['Tarjeta', transaction.creditCard?.name],
    ['Préstamo', transaction.debt?.name],
    ['Cuotas', transaction.installments && transaction.installments > 1 ? String(transaction.installments) : null],
    ['Método', transaction.method ? DERIVED_METHOD_LABELS[transaction.method] : null],
    ['Fuente / comercio', transaction.payee],
    ['Etiquetas', transaction.tags.join(', ') || null],
    ['Notas', transaction.notes],
  ];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={d.title} description={d.subtitle}>
      <p className="text-center text-3xl font-semibold">
        <Amount value={transaction.amount} tone={d.tone} />
      </p>
      {transaction.interest > 0 && <p className="mt-1 text-center text-sm text-muted">Intereses registrados como gasto aparte.</p>}
      <dl className="mt-4 divide-y divide-border text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
      </dl>
      {transaction.parentId ? (
        <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          Este gasto de intereses es parte de un pago de préstamo. Para cambiarlo, edita o elimina el pago principal.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              onClose();
              open({ kind: kindForTransaction(transaction), edit: transaction });
            }}
          >
            Editar
          </Button>
          <ConfirmButton loading={remove.isPending} onConfirm={() => remove.mutate(transaction.id)}>
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 7: Página de movimientos**

`apps/web/src/features/transactions/TransactionsPage.tsx`:
```tsx
import type { Page, TransactionDTO } from '@finanzas/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ListFilter, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { TextInput } from '../../components/ui/Field';
import { PageSpinner, Spinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { dayHeading } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useDebounced } from '../../lib/useDebounced';
import { useToday } from '../auth/useAuth';
import { FiltersSheet } from './FiltersSheet';
import { activeFilterCount, EMPTY_FILTERS, filtersToParams, groupByDate, type TxFilters } from './filters';
import { TransactionDetailSheet } from './TransactionDetailSheet';
import { TransactionRow } from './TransactionRow';

export function TransactionsPage() {
  const today = useToday();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [filters, setFilters] = useState<TxFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<TransactionDTO | null>(null);
  const params = filtersToParams(filters, q, today).toString();

  const query = useInfiniteQuery({
    queryKey: [...qk.transactions, params],
    queryFn: ({ pageParam }) =>
      api.get<Page<TransactionDTO>>(`/transactions?${params}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const count = activeFilterCount(filters);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Movimientos</h1>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
          <TextInput type="search" aria-label="Buscar" placeholder="Buscar" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Button variant="secondary" onClick={() => setFiltersOpen(true)} aria-label="Filtros">
          <ListFilter size={18} />
          {count > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-fg">{count}</span>}
        </Button>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={count || q ? 'No hay movimientos con esos filtros' : 'Aún no tienes movimientos'} description="Usa el botón + para registrar el primero." />
      ) : (
        <div className="space-y-4">
          {groupByDate(items).map((group) => (
            <section key={group.date}>
              <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{dayHeading(group.date, today)}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
                {group.items.map((t) => (
                  <li key={t.id}>
                    <TransactionRow transaction={t} onSelect={setSelected} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div ref={sentinel} className="flex justify-center py-2">
            {isFetchingNextPage ? (
              <Spinner />
            ) : hasNextPage ? (
              <Button variant="ghost" onClick={() => void fetchNextPage()}>
                Cargar más
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <FiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen} value={filters} onApply={setFilters} />
      <TransactionDetailSheet transaction={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
```

- [ ] **Step 8: Agregar la ruta**

En `apps/web/src/app/router.tsx`, dentro de `appRoutes`, después de `/dashboard`:
```tsx
  { path: '/transactions', lazy: page(() => import('../features/transactions/TransactionsPage'), (m) => m.TransactionsPage) },
```

- [ ] **Step 9: Verificar**

Run: `npm test -w @finanzas/web && npm run typecheck -w @finanzas/web && npm run lint`
Expected: PASS (incluye `TransactionRow.test.tsx` y `filters.test.ts`).

Run (dev con usuario demo, 360 px): abrir Movimientos, desplazarse hasta cargar más de 30, buscar "mercado", filtrar por Nu Crédito, abrir un pago de tarjeta (gris, "Pago tarjeta") y editar un gasto.
Expected: agrupación Hoy/Ayer/fecha, carga incremental, filtros con contador y edición que actualiza saldos y dashboard.

---

### Task 21: Gestión — cuentas, tarjetas (con detalle), préstamos, categorías y perfil

**Files:**
- Create: `apps/web/src/components/ui/Pickers.tsx`, `apps/web/src/lib/useCrud.ts`, `apps/web/src/features/accounts/AccountsPage.tsx`, `apps/web/src/features/accounts/AccountFormSheet.tsx`, `apps/web/src/features/cards/CardsPage.tsx`, `apps/web/src/features/cards/CardFormSheet.tsx`, `apps/web/src/features/cards/CardDetailPage.tsx`, `apps/web/src/features/debts/DebtsPage.tsx`, `apps/web/src/features/debts/DebtFormSheet.tsx`, `apps/web/src/features/debts/DisbursementSheet.tsx`, `apps/web/src/features/categories/CategoriesPage.tsx`, `apps/web/src/features/categories/CategoryFormSheet.tsx`, `apps/web/src/features/profile/ProfilePage.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Test: `apps/web/src/features/accounts/AccountsPage.test.tsx`

**Interfaces:**
- Consumes: `useAccounts`, `useCards`, `useDebts`, `useCategories`, `invalidateFinance`, `qk` (Task 17); `useMe`, `useLogout` (Task 17); `useQuickAdd` (Task 18); `TransactionRow`, `TransactionDetailSheet` (Task 20); UI (Task 16).
- Produces:
  - `ColorPicker({ value, onChange })`, `IconPicker({ value, onChange })`, `COLOR_CHOICES`.
  - `useCrudMutation(fn, successMessage)` → `useMutation` que invalida datos financieros y categorías y muestra un aviso.
  - Páginas `AccountsPage`, `CardsPage`, `CardDetailPage`, `DebtsPage`, `CategoriesPage`, `ProfilePage` y sus formularios en panel.
  - Rutas `/accounts`, `/cards`, `/cards/:id`, `/debts`, `/categories`, `/profile`.

- [ ] **Step 1: Escribir el test que falla**

`apps/web/src/features/accounts/AccountsPage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { AccountsPage } from './AccountsPage';

afterEach(() => vi.unstubAllGlobals());

const bancolombia = {
  id: 'a1',
  name: 'Bancolombia',
  type: 'BANK',
  institution: null,
  initialBalance: 1_000_000,
  openingDate: '2026-10-01',
  icon: 'landmark',
  color: '#ca8a04',
  isActive: true,
  sortOrder: 0,
  balance: 1_500_000,
};

describe('AccountsPage', () => {
  it('lists accounts with the total and creates a new one', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'POST /accounts': (body) => {
        posted.push(body);
        return { status: 201, body: { account: { ...bancolombia, id: 'a2', name: 'Nequi' } } };
      },
    });
    renderWithProviders(<AccountsPage />);
    expect(await screen.findByText('Bancolombia')).toBeInTheDocument();
    expect(screen.getAllByText('$1.500.000').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nequi');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'DIGITAL_WALLET');
    await userEvent.type(screen.getByLabelText('Saldo actual'), '150000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cuenta' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ name: 'Nequi', type: 'DIGITAL_WALLET', initialBalance: 150000, icon: 'smartphone' });
  });

  it('shows the API reason when archiving is not allowed', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'PUT /accounts/a1': () => ({
        status: 409,
        body: { error: { code: 'ACCOUNT_HAS_BALANCE', message: 'Solo puedes archivar una cuenta con saldo $0.' } },
      }),
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByText('Bancolombia'));
    await userEvent.click(screen.getByRole('button', { name: 'Archivar' }));
    expect(await screen.findByText('Solo puedes archivar una cuenta con saldo $0.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -w @finanzas/web -- AccountsPage`
Expected: FAIL — `./AccountsPage` no existe.

- [ ] **Step 3: Piezas compartidas**

`apps/web/src/components/ui/Pickers.tsx`:
```tsx
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon, ICON_CHOICES } from '../../lib/icons';

export const COLOR_CHOICES = ['#0f766e', '#0ea5e9', '#6366f1', '#7c3aed', '#820ad1', '#ec4899', '#ef4444', '#f97316', '#ca8a04', '#16a34a', '#64748b', '#0f172a'];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
      {COLOR_CHOICES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className="flex size-11 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: c }}
        >
          {value === c && <Check size={18} />}
        </button>
      ))}
    </div>
  );
}

export function IconPicker({ value, onChange }: { value: string; onChange: (i: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Ícono" className="flex flex-wrap gap-2">
      {ICON_CHOICES.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={name}
          onClick={() => onChange(name)}
          className={cn('flex size-11 items-center justify-center rounded-xl border', value === name ? 'border-primary bg-primary/10 text-primary' : 'border-border')}
        >
          <Icon name={name} size={18} />
        </button>
      ))}
    </div>
  );
}
```

`apps/web/src/lib/useCrud.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/ui/Toast';
import type { ApiError } from './api';
import { invalidateFinance, qk } from './queries';

/** Mutación de gestión: refresca dashboard, listas y categorías, y avisa. */
export function useCrudMutation<TInput, TResult = unknown>(fn: (input: TInput) => Promise<TResult>, successMessage: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<TResult, ApiError, TInput>({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([invalidateFinance(queryClient), queryClient.invalidateQueries({ queryKey: qk.categories })]);
      toast.show({ message: successMessage });
    },
  });
}
```

- [ ] **Step 4: Cuentas**

`apps/web/src/features/accounts/AccountFormSheet.tsx`:
```tsx
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, type AccountDTO, type AccountType } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';

const DEFAULT_ICON: Record<AccountType, string> = {
  CASH: 'banknote',
  BANK: 'landmark',
  DIGITAL_WALLET: 'smartphone',
  SAVINGS: 'piggy-bank',
  INVESTMENT: 'trending-up',
  OTHER: 'wallet',
};

export function AccountFormSheet({ open, onOpenChange, account }: { open: boolean; onOpenChange: (o: boolean) => void; account?: AccountDTO }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={account ? 'Editar cuenta' : 'Nueva cuenta'}>
      {open && <AccountForm account={account} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function AccountForm({ account, onDone }: { account?: AccountDTO; onDone: () => void }) {
  const today = useToday();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'BANK');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [initialBalance, setInitialBalance] = useState<number | null>(account?.initialBalance ?? null);
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? today);
  const [icon, setIcon] = useState(account?.icon ?? DEFAULT_ICON.BANK);
  const [iconTouched, setIconTouched] = useState(!!account);
  const [color, setColor] = useState(account?.color ?? '#0f766e');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const save = useCrudMutation(
    (body: Record<string, unknown>) => (account ? api.put(`/accounts/${account.id}`, body) : api.post('/accounts', body)),
    account ? 'Cuenta actualizada' : 'Cuenta creada',
  );
  const archive = useCrudMutation(() => api.put(`/accounts/${account!.id}`, { isActive: !account!.isActive }), account?.isActive ? 'Cuenta archivada' : 'Cuenta reactivada');
  const remove = useCrudMutation(() => api.del(`/accounts/${account!.id}`), 'Cuenta eliminada');
  const onError = (err: { message: string; fields?: Record<string, string> }) => {
    setFields(err.fields ?? {});
    setError(err.fields ? null : err.message);
  };

  const submit = () => {
    if (!name.trim()) return setFields({ name: 'Escribe un nombre' });
    save.mutate(
      { name, type, institution: institution || null, initialBalance: initialBalance ?? 0, openingDate, icon, color },
      { onSuccess: onDone, onError },
    );
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Nombre" htmlFor="acc-name" error={fields.name}>
        <TextInput id="acc-name" maxLength={60} placeholder="Bancolombia, Nequi, Efectivo…" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Tipo" htmlFor="acc-type" hint={type === 'SAVINGS' || type === 'INVESTMENT' ? 'Cuenta en el dinero total, pero no en el disponible.' : undefined}>
        <Select
          id="acc-type"
          value={type}
          onChange={(e) => {
            const next = e.target.value as AccountType;
            setType(next);
            if (!iconTouched) setIcon(DEFAULT_ICON[next]);
          }}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
          ))}
        </Select>
      </Field>
      <Field label="Entidad (opcional)" htmlFor="acc-inst">
        <TextInput id="acc-inst" maxLength={60} value={institution} onChange={(e) => setInstitution(e.target.value)} />
      </Field>
      <Field label="Saldo actual" htmlFor="acc-balance" error={fields.initialBalance} hint="El saldo que tiene hoy. Los movimientos que registres lo irán ajustando.">
        <MoneyInput id="acc-balance" value={initialBalance} onChange={setInitialBalance} />
      </Field>
      <Field label="Fecha de apertura en la app" htmlFor="acc-date" hint="Movimientos anteriores a esta fecha ya están incluidos en el saldo.">
        <TextInput id="acc-date" type="date" max={today} value={openingDate} onChange={(e) => e.target.value && setOpeningDate(e.target.value)} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Ícono</p>
        <IconPicker
          value={icon}
          onChange={(i) => {
            setIcon(i);
            setIconTouched(true);
          }}
        />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar cuenta
      </Button>
      {account && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" loading={archive.isPending} onClick={() => archive.mutate(undefined, { onSuccess: onDone, onError })}>
            {account.isActive ? 'Archivar' : 'Reactivar'}
          </Button>
          <ConfirmButton loading={remove.isPending} onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}>
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </form>
  );
}
```

`apps/web/src/features/accounts/AccountsPage.tsx`:
```tsx
import { ACCOUNT_TYPE_LABELS, isLiquidAccount, type AccountDTO } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { Icon } from '../../lib/icons';
import { useAccounts } from '../../lib/queries';
import { AccountFormSheet } from './AccountFormSheet';

function AccountList({ title, accounts, onSelect }: { title: string; accounts: AccountDTO[]; onSelect: (a: AccountDTO) => void }) {
  if (accounts.length === 0) return null;
  return (
    <section>
      <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {accounts.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onSelect(a)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
              <span className="flex size-10 items-center justify-center rounded-full text-white" style={{ backgroundColor: a.color }}>
                <Icon name={a.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.name}</span>
                <span className="block text-xs text-muted">{[ACCOUNT_TYPE_LABELS[a.type], a.institution].filter(Boolean).join(' · ')}</span>
              </span>
              <Amount value={a.balance} tone={a.balance < 0 ? 'debt' : 'neutral'} className="font-semibold" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AccountsPage() {
  const accounts = useAccounts();
  const [editing, setEditing] = useState<AccountDTO | undefined>();
  const [open, setOpen] = useState(false);
  const openForm = (a?: AccountDTO) => {
    setEditing(a);
    setOpen(true);
  };

  if (accounts.isPending) return <PageSpinner />;
  if (accounts.isError) return <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;
  const active = accounts.data.filter((a) => a.isActive);
  const total = active.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mis cuentas</h1>
        <Button size="sm" onClick={() => openForm()} aria-label="Nueva cuenta">
          <Plus size={16} /> Nueva
        </Button>
      </div>
      {accounts.data.length === 0 ? (
        <EmptyState title="Aún no tienes cuentas" description="Agrega efectivo, bancos, billeteras como Nequi o Daviplata, y tus cuentas de ahorro." />
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl bg-surface p-4 ring-1 ring-border">
            <span className="font-medium">Dinero total</span>
            <Amount value={total} className="text-lg font-semibold" />
          </div>
          <AccountList title="Disponibles" accounts={active.filter((a) => isLiquidAccount(a.type))} onSelect={openForm} />
          <AccountList title="Ahorro e inversión" accounts={active.filter((a) => !isLiquidAccount(a.type))} onSelect={openForm} />
          <AccountList title="Archivadas" accounts={accounts.data.filter((a) => !a.isActive)} onSelect={openForm} />
        </>
      )}
      <AccountFormSheet open={open} onOpenChange={setOpen} account={editing} />
    </div>
  );
}
```

- [ ] **Step 5: Tarjetas**

`apps/web/src/features/cards/CardFormSheet.tsx`:
```tsx
import type { CreditCardDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ColorPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';

export function CardFormSheet({ open, onOpenChange, card, onDeleted }: { open: boolean; onOpenChange: (o: boolean) => void; card?: CreditCardDTO; onDeleted?: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={card ? 'Editar tarjeta' : 'Nueva tarjeta'}>
      {open && <CardForm card={card} onDone={() => onOpenChange(false)} onDeleted={onDeleted} />}
    </Sheet>
  );
}

const day = (v: string) => v.replace(/\D/g, '').slice(0, 2);

function CardForm({ card, onDone, onDeleted }: { card?: CreditCardDTO; onDone: () => void; onDeleted?: () => void }) {
  const today = useToday();
  const [name, setName] = useState(card?.name ?? '');
  const [issuer, setIssuer] = useState(card?.issuer ?? '');
  const [creditLimit, setCreditLimit] = useState<number | null>(card?.creditLimit ?? null);
  const [statementDay, setStatementDay] = useState(String(card?.statementDay ?? ''));
  const [paymentDueDay, setPaymentDueDay] = useState(String(card?.paymentDueDay ?? ''));
  const [initialDebt, setInitialDebt] = useState<number | null>(card?.initialDebt ?? null);
  const [initialInstallments, setInitialInstallments] = useState(String(card?.initialDebtInstallments ?? 1));
  const [openingDate, setOpeningDate] = useState(card?.openingDate ?? today);
  const [color, setColor] = useState(card?.color ?? '#820ad1');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const save = useCrudMutation(
    (body: Record<string, unknown>) => (card ? api.put(`/credit-cards/${card.id}`, body) : api.post('/credit-cards', body)),
    card ? 'Tarjeta actualizada' : 'Tarjeta creada',
  );
  const archive = useCrudMutation(() => api.put(`/credit-cards/${card!.id}`, { isActive: !card!.isActive }), card?.isActive ? 'Tarjeta archivada' : 'Tarjeta reactivada');
  const remove = useCrudMutation(() => api.del(`/credit-cards/${card!.id}`), 'Tarjeta eliminada');
  const onError = (err: { message: string; fields?: Record<string, string> }) => {
    setFields(err.fields ?? {});
    setError(err.fields ? null : err.message);
  };

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!creditLimit) next.creditLimit = 'Escribe el cupo total';
    const s = Number(statementDay);
    const p = Number(paymentDueDay);
    if (!(s >= 1 && s <= 31)) next.statementDay = 'Día entre 1 y 31';
    if (!(p >= 1 && p <= 31)) next.paymentDueDay = 'Día entre 1 y 31';
    setFields(next);
    if (Object.keys(next).length > 0) return;
    save.mutate(
      {
        name,
        issuer: issuer || null,
        creditLimit,
        statementDay: s,
        paymentDueDay: p,
        initialDebt: initialDebt ?? 0,
        initialDebtInstallments: Number(initialInstallments) || 1,
        openingDate,
        color,
        icon: 'credit-card',
      },
      { onSuccess: onDone, onError },
    );
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Nombre" htmlFor="card-name" error={fields.name}>
        <TextInput id="card-name" maxLength={60} placeholder="Nu Crédito" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Banco o plataforma (opcional)" htmlFor="card-issuer">
        <TextInput id="card-issuer" maxLength={60} value={issuer} onChange={(e) => setIssuer(e.target.value)} />
      </Field>
      <Field label="Cupo total" htmlFor="card-limit" error={fields.creditLimit}>
        <MoneyInput id="card-limit" value={creditLimit} onChange={setCreditLimit} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Día de corte" htmlFor="card-cut" error={fields.statementDay}>
          <TextInput id="card-cut" inputMode="numeric" value={statementDay} onChange={(e) => setStatementDay(day(e.target.value))} />
        </Field>
        <Field label="Día límite de pago" htmlFor="card-due" error={fields.paymentDueDay}>
          <TextInput id="card-due" inputMode="numeric" value={paymentDueDay} onChange={(e) => setPaymentDueDay(day(e.target.value))} />
        </Field>
      </div>
      <Field label="Deuda actual al registrarla" htmlFor="card-debt" hint="Lo que ya debes hoy en esta tarjeta (no se cuenta como gasto de este mes).">
        <MoneyInput id="card-debt" value={initialDebt} onChange={setInitialDebt} />
      </Field>
      {(initialDebt ?? 0) > 0 && (
        <Field label="Cuotas pendientes de esa deuda" htmlFor="card-inst" hint="Si la pagas completa el próximo mes, deja 1.">
          <TextInput id="card-inst" inputMode="numeric" value={initialInstallments} onChange={(e) => setInitialInstallments(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Field>
      )}
      <Field label="Fecha de registro" htmlFor="card-date">
        <TextInput id="card-date" type="date" max={today} value={openingDate} onChange={(e) => e.target.value && setOpeningDate(e.target.value)} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar tarjeta
      </Button>
      {card && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" loading={archive.isPending} onClick={() => archive.mutate(undefined, { onSuccess: onDone, onError })}>
            {card.isActive ? 'Archivar' : 'Reactivar'}
          </Button>
          <ConfirmButton
            loading={remove.isPending}
            onConfirm={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  onDone();
                  onDeleted?.();
                },
                onError,
              })
            }
          >
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </form>
  );
}
```

`apps/web/src/features/cards/CardsPage.tsx`:
```tsx
import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { formatShortDate } from '../../lib/format';
import { useCards } from '../../lib/queries';
import { CardFormSheet } from './CardFormSheet';

export function CardsPage() {
  const cards = useCards();
  const [open, setOpen] = useState(false);
  if (cards.isPending) return <PageSpinner />;
  if (cards.isError) return <ErrorState error={cards.error} onRetry={() => void cards.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tarjetas de crédito</h1>
        <Button size="sm" onClick={() => setOpen(true)} aria-label="Nueva tarjeta">
          <Plus size={16} /> Nueva
        </Button>
      </div>
      {cards.data.length === 0 ? (
        <EmptyState title="Aún no tienes tarjetas" description="Registra tus tarjetas de crédito para controlar su deuda, cuotas y fechas de pago." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          {cards.data.map((c) => (
            <li key={c.id}>
              <Link to={`/cards/${c.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {c.name} {!c.isActive && <span className="text-xs text-muted">(archivada)</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {c.amountDue > 0 ? `Pago del mes vence ${formatShortDate(c.dueDate)}` : 'Sin pago pendiente'}
                  </span>
                </span>
                <span className="text-right">
                  <Amount value={Math.max(c.debt, 0)} tone={c.debt > 0 ? 'debt' : 'neutral'} className="block font-semibold" />
                  <span className="text-xs text-muted">de <Amount value={c.creditLimit} /></span>
                </span>
                <ChevronRight size={18} className="text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CardFormSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
```

`apps/web/src/features/cards/CardDetailPage.tsx`:
```tsx
import type { CardStatementDTO, Page, TransactionDTO } from '@finanzas/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatShortDate } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useQuickAdd } from '../quick-add/QuickAddContext';
import { TransactionDetailSheet } from '../transactions/TransactionDetailSheet';
import { TransactionRow } from '../transactions/TransactionRow';
import { CardFormSheet } from './CardFormSheet';

export function CardDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { open } = useQuickAdd();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<TransactionDTO | null>(null);
  const statement = useQuery({ queryKey: [...qk.cards, id, 'statement'], queryFn: () => api.get<CardStatementDTO>(`/credit-cards/${id}/statement`) });
  const movements = useQuery({
    queryKey: [...qk.transactions, 'card', id],
    queryFn: () => api.get<Page<TransactionDTO>>(`/transactions?creditCardId=${id}&limit=20`),
  });

  if (statement.isPending) return <PageSpinner />;
  if (statement.isError) return <ErrorState error={statement.error} onRetry={() => void statement.refetch()} />;
  const { card, upcoming } = statement.data;

  return (
    <div className="space-y-4">
      <Link to="/cards" className="inline-flex items-center gap-1 text-sm text-primary">
        <ArrowLeft size={16} /> Tarjetas
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{card.name}</h1>
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Editar
        </Button>
      </div>
      <Card>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted">Cupo</dt>
            <dd className="font-semibold"><Amount value={card.creditLimit} /></dd>
          </div>
          <div>
            <dt className="text-muted">Deuda</dt>
            <dd className="font-semibold"><Amount value={Math.max(card.debt, 0)} tone={card.debt > 0 ? 'debt' : 'neutral'} /></dd>
          </div>
          <div>
            <dt className="text-muted">Disponible</dt>
            <dd className="font-semibold"><Amount value={card.available} /></dd>
          </div>
        </dl>
        <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
          <p>
            Pago del mes: <Amount value={card.amountDue} className="font-semibold" />{' '}
            {card.amountDue > 0 && <span className={card.isOverdue ? 'text-negative' : 'text-muted'}>{card.isOverdue ? 'vencido' : 'vence'} {formatShortDate(card.dueDate)}</span>}
          </p>
          <p className="mt-1 text-muted">
            Corte: {formatShortDate(card.lastCutoff)} · próximo corte {formatShortDate(card.nextCutoff)} (pago {formatShortDate(card.nextDueDate)})
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button disabled={card.debt <= 0} onClick={() => open({ kind: 'card-payment', cardId: card.id })}>
            Pagar tarjeta
          </Button>
          <Button variant="secondary" disabled={!card.isActive} onClick={() => open({ kind: 'card-purchase', cardId: card.id })}>
            Registrar compra
          </Button>
        </div>
      </Card>

      {upcoming.length > 0 && (
        <Card>
          <CardTitle>Cuotas próximas</CardTitle>
          <ul className="mt-2 divide-y divide-border text-sm">
            {upcoming.map((u) => (
              <li key={u.cutoff} className="flex justify-between py-2">
                <span>Corte {formatShortDate(u.cutoff)} · paga {formatShortDate(u.dueDate)}</span>
                <Amount value={u.amount} className="font-medium" />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Estimado sin intereses. Lo que cobre el banco regístralo como compra en "Intereses y comisiones".</p>
        </Card>
      )}

      <section>
        <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase">Movimientos recientes</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          {(movements.data?.items ?? []).map((t) => (
            <li key={t.id}>
              <TransactionRow transaction={t} onSelect={setSelected} />
            </li>
          ))}
          {movements.data?.items.length === 0 && <li className="p-4 text-sm text-muted">Sin movimientos todavía.</li>}
        </ul>
      </section>

      <CardFormSheet open={editing} onOpenChange={setEditing} card={card} onDeleted={() => navigate('/cards', { replace: true })} />
      <TransactionDetailSheet transaction={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
```

- [ ] **Step 6: Préstamos**

`apps/web/src/features/debts/DebtFormSheet.tsx`:
```tsx
import type { DebtDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ColorPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { useAccounts } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';

export function DebtFormSheet({ open, onOpenChange, debt }: { open: boolean; onOpenChange: (o: boolean) => void; debt?: DebtDTO }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={debt ? 'Editar préstamo' : 'Nuevo préstamo'}>
      {open && <DebtForm debt={debt} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function DebtForm({ debt, onDone }: { debt?: DebtDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const [name, setName] = useState(debt?.name ?? '');
  const [lender, setLender] = useState(debt?.lender ?? '');
  const [balance, setBalance] = useState<number | null>(debt?.initialBalance ?? null);
  const [monthlyPayment, setMonthlyPayment] = useState<number | null>(debt?.monthlyPayment ?? null);
  const [paymentDay, setPaymentDay] = useState(debt?.paymentDay ? String(debt.paymentDay) : '');
  const [receivedIn, setReceivedIn] = useState('');
  const [openingDate, setOpeningDate] = useState(debt?.openingDate ?? today);
  const [color, setColor] = useState(debt?.color ?? '#0f766e');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const save = useCrudMutation(
    (body: Record<string, unknown>) => (debt ? api.put(`/debts/${debt.id}`, body) : api.post('/debts', body)),
    debt ? 'Préstamo actualizado' : 'Préstamo creado',
  );
  const archive = useCrudMutation(() => api.put(`/debts/${debt!.id}`, { isActive: !debt!.isActive }), debt?.isActive ? 'Préstamo archivado' : 'Préstamo reactivado');
  const remove = useCrudMutation(() => api.del(`/debts/${debt!.id}`), 'Préstamo eliminado');
  const onError = (err: { message: string; fields?: Record<string, string> }) => {
    setFields(err.fields ?? {});
    setError(err.fields ? null : err.message);
  };

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!debt && !balance) next.initialBalance = receivedIn ? 'Escribe el valor recibido' : 'Escribe cuánto debes hoy';
    const pDay = paymentDay ? Number(paymentDay) : null;
    if (pDay !== null && !(pDay >= 1 && pDay <= 31)) next.paymentDay = 'Día entre 1 y 31';
    setFields(next);
    if (Object.keys(next).length > 0) return;
    const common = { name, lender: lender || null, monthlyPayment, paymentDay: pDay, openingDate, color, icon: 'landmark' };
    save.mutate(
      debt ? { ...common, initialBalance: balance ?? 0 } : { ...common, initialBalance: balance ?? 0, receivedInAccountId: receivedIn || null },
      { onSuccess: onDone, onError },
    );
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Nombre" htmlFor="debt-name" error={fields.name}>
        <TextInput id="debt-name" maxLength={60} placeholder="Crédito libre inversión" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Acreedor (opcional)" htmlFor="debt-lender">
        <TextInput id="debt-lender" maxLength={60} value={lender} onChange={(e) => setLender(e.target.value)} />
      </Field>
      {!debt && (
        <Field label="¿Recibiste el dinero ahora?" htmlFor="debt-received" hint="Si lo recibes en una cuenta, entra como deuda, no como ingreso.">
          <Select id="debt-received" value={receivedIn} onChange={(e) => setReceivedIn(e.target.value)}>
            <option value="">No, ya lo debía</option>
            {(accounts.data ?? []).filter((a) => a.isActive).map((a) => (
              <option key={a.id} value={a.id}>Sí, en {a.name}</option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={receivedIn ? 'Valor recibido' : debt ? 'Saldo inicial registrado' : 'Saldo que debes hoy'} htmlFor="debt-balance" error={fields.initialBalance}>
        <MoneyInput id="debt-balance" value={balance} onChange={setBalance} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cuota mensual" htmlFor="debt-payment">
          <MoneyInput id="debt-payment" value={monthlyPayment} onChange={setMonthlyPayment} />
        </Field>
        <Field label="Día de pago" htmlFor="debt-day" error={fields.paymentDay}>
          <TextInput id="debt-day" inputMode="numeric" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Field>
      </div>
      <Field label="Fecha" htmlFor="debt-date">
        <TextInput id="debt-date" type="date" max={today} value={openingDate} onChange={(e) => e.target.value && setOpeningDate(e.target.value)} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar préstamo
      </Button>
      {debt && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" loading={archive.isPending} onClick={() => archive.mutate(undefined, { onSuccess: onDone, onError })}>
            {debt.isActive ? 'Archivar' : 'Reactivar'}
          </Button>
          <ConfirmButton loading={remove.isPending} onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}>
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </form>
  );
}
```

`apps/web/src/features/debts/DisbursementSheet.tsx`:
```tsx
import type { DebtDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { useAccounts } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';

export function DisbursementSheet({ debt, onClose }: { debt: DebtDTO | null; onClose: () => void }) {
  return (
    <Sheet open={debt !== null} onOpenChange={(o) => !o && onClose()} title="Registrar desembolso" description="Dinero adicional del préstamo que entra a tu cuenta. No es un ingreso.">
      {debt && <DisbursementForm debt={debt} onDone={onClose} />}
    </Sheet>
  );
}

function DisbursementForm({ debt, onDone }: { debt: DebtDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const [amount, setAmount] = useState<number | null>(null);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const save = useCrudMutation((body: Record<string, unknown>) => api.post(`/debts/${debt.id}/disbursements`, body), 'Desembolso registrado');

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!amount || !accountId) return setError('Escribe el valor y elige la cuenta');
        save.mutate({ amount, accountId, date }, { onSuccess: onDone, onError: (err) => setError(err.message) });
      }}
    >
      <Field label="Valor" htmlFor="disb-amount">
        <MoneyInput id="disb-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field label="Recibido en" htmlFor="disb-account">
        <Select id="disb-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {(accounts.data ?? []).filter((a) => a.isActive).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </Field>
      <DateChips value={date} onChange={setDate} today={today} />
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar
      </Button>
    </form>
  );
}
```

`apps/web/src/features/debts/DebtsPage.tsx`:
```tsx
import type { DebtDTO } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { formatShortDate } from '../../lib/format';
import { useDebts } from '../../lib/queries';
import { useQuickAdd } from '../quick-add/QuickAddContext';
import { DebtFormSheet } from './DebtFormSheet';
import { DisbursementSheet } from './DisbursementSheet';

export function DebtsPage() {
  const debts = useDebts();
  const { open } = useQuickAdd();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DebtDTO | undefined>();
  const [disbursing, setDisbursing] = useState<DebtDTO | null>(null);
  if (debts.isPending) return <PageSpinner />;
  if (debts.isError) return <ErrorState error={debts.error} onRetry={() => void debts.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Préstamos</h1>
        <Button
          size="sm"
          aria-label="Nuevo préstamo"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={16} /> Nuevo
        </Button>
      </div>
      {debts.data.length === 0 ? (
        <EmptyState title="No tienes préstamos registrados" description="Créditos de libre inversión, vehículo o dinero que le debes a alguien." />
      ) : (
        <ul className="space-y-3">
          {debts.data.map((d) => (
            <li key={d.id} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {d.name} {!d.isActive && <span className="text-xs text-muted">(archivado)</span>}
                  </p>
                  <p className="text-xs text-muted">{d.lender ?? 'Sin acreedor'}</p>
                </div>
                <Amount value={d.balance} tone="debt" className="font-semibold" />
              </div>
              {d.monthlyPayment && (
                <p className="mt-2 text-sm text-muted">
                  Cuota <Amount value={d.monthlyPayment} />
                  {d.installmentDue > 0 && d.nextPaymentDate ? ` · pendiente ${formatShortDate(d.nextPaymentDate)}` : ' · al día este mes'}
                </p>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button size="sm" disabled={d.balance <= 0} onClick={() => open({ kind: 'loan-payment', debtId: d.id })}>
                  Pagar
                </Button>
                <Button size="sm" variant="secondary" disabled={!d.isActive} onClick={() => setDisbursing(d)}>
                  Desembolso
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(d);
                    setFormOpen(true);
                  }}
                >
                  Editar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DebtFormSheet open={formOpen} onOpenChange={setFormOpen} debt={editing} />
      <DisbursementSheet debt={disbursing} onClose={() => setDisbursing(null)} />
    </div>
  );
}
```

- [ ] **Step 7: Categorías**

`apps/web/src/features/categories/CategoryFormSheet.tsx`:
```tsx
import { BUCKET_LABELS, BUCKETS, type Bucket, type CategoryDTO, type CategoryKind } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { useCategories } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: CategoryKind;
  category?: CategoryDTO;
}

export function CategoryFormSheet({ open, onOpenChange, kind, category }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={category ? 'Editar categoría' : 'Nueva categoría'}>
      {open && <CategoryForm kind={category?.kind ?? kind} category={category} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function CategoryForm({ kind, category, onDone }: { kind: CategoryKind; category?: CategoryDTO; onDone: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState(category?.name ?? '');
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [bucket, setBucket] = useState<Bucket>(category?.bucket ?? 'OTHER');
  const [icon, setIcon] = useState(category?.icon ?? 'tag');
  const [color, setColor] = useState(category?.color ?? '#64748b');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const parents = (categories.data ?? []).filter((c) => c.kind === kind && !c.parentId && !c.isSystem && c.id !== category?.id);
  const save = useCrudMutation(
    (body: Record<string, unknown>) => (category ? api.put(`/categories/${category.id}`, body) : api.post('/categories', body)),
    category ? 'Categoría actualizada' : 'Categoría creada',
  );
  const archive = useCrudMutation(() => api.put(`/categories/${category!.id}`, { isActive: !category!.isActive }), category?.isActive ? 'Categoría archivada' : 'Categoría reactivada');
  const remove = useCrudMutation(() => api.del(`/categories/${category!.id}`), 'Categoría eliminada');
  const onError = (err: { message: string; fields?: Record<string, string> }) => {
    setFields(err.fields ?? {});
    setError(err.fields ? null : err.message);
  };

  const submit = () => {
    if (!name.trim()) return setFields({ name: 'Escribe un nombre' });
    const common = { name, parentId: parentId || null, icon, color, ...(kind === 'EXPENSE' && { bucket }) };
    save.mutate(category ? common : { ...common, kind }, { onSuccess: onDone, onError });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Nombre" htmlFor="cat-name" error={fields.name}>
        <TextInput id="cat-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Categoría principal (opcional)" htmlFor="cat-parent" error={fields.parentId} hint="Déjala vacía para crear una categoría principal.">
        <Select id="cat-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Ninguna</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </Field>
      {kind === 'EXPENSE' && (
        <Field label="Bolsa" htmlFor="cat-bucket" hint="Se usa para comparar con tus porcentajes objetivo.">
          <Select id="cat-bucket" value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>
            {BUCKETS.map((b) => (
              <option key={b} value={b}>{BUCKET_LABELS[b]}</option>
            ))}
          </Select>
        </Field>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium">Ícono</p>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar categoría
      </Button>
      {category && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" loading={archive.isPending} onClick={() => archive.mutate(undefined, { onSuccess: onDone, onError })}>
            {category.isActive ? 'Archivar' : 'Reactivar'}
          </Button>
          <ConfirmButton disabled={!!category.systemKey} loading={remove.isPending} onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}>
            Eliminar
          </ConfirmButton>
        </div>
      )}
    </form>
  );
}
```

`apps/web/src/features/categories/CategoriesPage.tsx`:
```tsx
import { BUCKET_LABELS, type CategoryDTO, type CategoryKind } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { cn } from '../../lib/cn';
import { Icon } from '../../lib/icons';
import { useCategories } from '../../lib/queries';
import { CategoryFormSheet } from './CategoryFormSheet';

export function CategoriesPage() {
  const categories = useCategories();
  const [kind, setKind] = useState<CategoryKind>('EXPENSE');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDTO | undefined>();
  if (categories.isPending) return <PageSpinner />;
  if (categories.isError) return <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />;

  const visible = categories.data.filter((c) => c.kind === kind && !c.isSystem);
  const roots = visible.filter((c) => !c.parentId);
  const edit = (c?: CategoryDTO) => {
    setEditing(c);
    setOpen(true);
  };
  const row = (c: CategoryDTO, child = false) => (
    <li key={c.id}>
      <button type="button" onClick={() => edit(c)} className={cn('flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left', child && 'pl-12')}>
        <span className="flex size-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: c.color }}>
          <Icon name={c.icon} size={16} />
        </span>
        <span className="flex-1">
          <span className={cn('block', !c.isActive && 'text-muted line-through')}>{c.name}</span>
          {!child && c.bucket && <span className="block text-xs text-muted">{BUCKET_LABELS[c.bucket]}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categorías</h1>
        <Button size="sm" onClick={() => edit()} aria-label="Nueva categoría">
          <Plus size={16} /> Nueva
        </Button>
      </div>
      <Chips ariaLabel="Tipo de categoría" value={kind} onChange={setKind} options={[{ value: 'EXPENSE', label: 'Gastos' }, { value: 'INCOME', label: 'Ingresos' }]} />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {roots.flatMap((root) => [row(root), ...visible.filter((c) => c.parentId === root.id).map((c) => row(c, true))])}
      </ul>
      <p className="px-1 text-xs text-muted">
        Ahorrar no es un gasto: para ahorrar, transfiere a una cuenta de ahorro. Pagar una tarjeta o un préstamo tampoco es un gasto; solo los intereses lo son.
      </p>
      <CategoryFormSheet open={open} onOpenChange={setOpen} kind={kind} category={editing} />
    </div>
  );
}
```

- [ ] **Step 8: Perfil y seguridad**

`apps/web/src/features/profile/ProfilePage.tsx`:
```tsx
import type { UserDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { Field, TextInput } from '../../components/ui/Field';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { qk } from '../../lib/queries';
import { useLogout, useMe } from '../auth/useAuth';

export function ProfilePage() {
  const me = useMe();
  if (!me.data) return <PageSpinner />;
  return <ProfileContent user={me.data} />;
}

function ProfileContent({ user }: { user: UserDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const logout = useLogout();
  const [name, setName] = useState(user.name);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const updateName = useMutation({
    mutationFn: () => api.patch<{ user: UserDTO }>('/me', { name }),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(qk.me, updated);
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      toast.show({ message: 'Nombre actualizado' });
    },
  });
  const changePassword = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      setPasswordError(null);
      toast.show({ message: 'Contraseña actualizada. Cerramos tus otras sesiones.' });
    },
    onError: (err) => setPasswordError(err instanceof ApiError ? (err.fields?.currentPassword ?? err.fields?.newPassword ?? err.message) : 'No se pudo cambiar'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Perfil y seguridad</h1>
      <Card>
        <CardTitle>Tus datos</CardTitle>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateName.mutate();
          }}
        >
          <Field label="Nombre" htmlFor="profile-name">
            <TextInput id="profile-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <p className="text-sm text-muted">Email: {user.email}</p>
          <Button type="submit" loading={updateName.isPending} disabled={!name.trim() || name === user.name}>
            Guardar nombre
          </Button>
        </form>
      </Card>
      <Card>
        <CardTitle>Cambiar contraseña</CardTitle>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== confirm) return setPasswordError('Las contraseñas nuevas no coinciden');
            changePassword.mutate();
          }}
        >
          <Field label="Contraseña actual" htmlFor="pw-current">
            <TextInput id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="Nueva contraseña" htmlFor="pw-new" hint="Mínimo 8 caracteres.">
            <TextInput id="pw-new" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Repite la nueva contraseña" htmlFor="pw-confirm">
            <TextInput id="pw-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {passwordError && <p role="alert" className="text-sm text-negative">{passwordError}</p>}
          <Button type="submit" loading={changePassword.isPending}>
            Cambiar contraseña
          </Button>
        </form>
      </Card>
      <Button variant="secondary" size="lg" loading={logout.isPending} onClick={() => logout.mutate()}>
        Cerrar sesión
      </Button>
    </div>
  );
}
```

- [ ] **Step 9: Rutas**

En `apps/web/src/app/router.tsx`, agregar a `appRoutes`:
```tsx
  { path: '/accounts', lazy: page(() => import('../features/accounts/AccountsPage'), (m) => m.AccountsPage) },
  { path: '/cards', lazy: page(() => import('../features/cards/CardsPage'), (m) => m.CardsPage) },
  { path: '/cards/:id', lazy: page(() => import('../features/cards/CardDetailPage'), (m) => m.CardDetailPage) },
  { path: '/debts', lazy: page(() => import('../features/debts/DebtsPage'), (m) => m.DebtsPage) },
  { path: '/categories', lazy: page(() => import('../features/categories/CategoriesPage'), (m) => m.CategoriesPage) },
  { path: '/profile', lazy: page(() => import('../features/profile/ProfilePage'), (m) => m.ProfilePage) },
```

- [ ] **Step 10: Verificar**

Run: `npm test -w @finanzas/web && npm run typecheck -w @finanzas/web && npm run lint && npm run build -w @finanzas/web`
Expected: todo en verde; el build genera `apps/web/dist` con un archivo JS por pantalla.

Run (dev, 360 px, usuario nuevo registrado desde `/register`): crear Efectivo, Bancolombia y Nequi; crear la tarjeta Nu Crédito (corte 15, pago 30); crear un préstamo recibido en Bancolombia; crear la subcategoría "Restaurantes" dentro de Alimentación; registrar movimientos desde "+"; archivar una cuenta con saldo (debe mostrar el motivo); cambiar la contraseña.
Expected: cada flujo funciona sin errores y el dashboard refleja los cambios al instante.

---

### Task 22: Docker, Docker Compose para Dokploy, backups y prueba de humo local

**Files:**
- Create: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/web/nginx.conf`, `apps/web/security-headers.conf`, `docker-compose.yml`, `docker-compose.local.yml`, `.env.example`, `.dockerignore`, `docker/backup/README.md`
- Modify: `apps/api/src/config/env.ts` (variable `TRUST_PROXY_HOPS`), `apps/api/src/app.ts` (`trustProxy` por número de saltos), `apps/api/src/config/env.test.ts`

**Interfaces:**
- Consumes: builds de `@finanzas/api` (tsup → `dist/server.js`) y `@finanzas/web` (Vite → `dist/`).
- Produces: imagen `api` (puerto 3000, ejecuta `prisma migrate deploy` al arrancar), imagen `web` (nginx en 8080, proxy `/api` → `api:3000`), servicios `db`, `api`, `web`, `backup`; `AppConfig.trustProxyHops: number`.

- [ ] **Step 1: Confiar solo en los proxies reales (Traefik + nginx)**

En `apps/api/src/config/env.ts` agregar al esquema:
```ts
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
```
agregar `trustProxyHops: number;` a `AppConfig` y `trustProxyHops: e.TRUST_PROXY_HOPS,` al objeto devuelto. En `apps/api/src/app.ts` reemplazar `trustProxy: true,` por:
```ts
    // Producción: Traefik → nginx → api (2 saltos). Desarrollo: proxy de Vite (1 salto).
    trustProxy: config.trustProxyHops,
```
Agregar al test `parses booleans, lists and SMTP` de `env.test.ts`: `TRUST_PROXY_HOPS: '2'` en la entrada y `expect(c.trustProxyHops).toBe(2);`; y en `applies defaults…` esperar `trustProxyHops: 1`.

Run: `npm test -w @finanzas/api -- env`
Expected: PASS.

- [ ] **Step 2: `.dockerignore`**

```
**/node_modules
**/dist
**/dev-dist
**/coverage
**/src/generated
**/playwright-report
**/test-results
.git
.env
**/.env
docs
*.log
```

- [ ] **Step 3: Imagen de la API**

`apps/api/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN npm ci --workspace @finanzas/api --workspace @finanzas/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# prisma generate no se conecta a la base, pero la configuración exige la variable.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build --workspace @finanzas/api

FROM base AS prod-deps
RUN npm ci --omit=dev --workspace @finanzas/api && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production TZ=America/Bogota
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/package.json apps/api/prisma.config.ts ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "-c", "node ../../node_modules/prisma/build/index.js migrate deploy && node dist/server.js"]
```

- [ ] **Step 4: Imagen web con nginx**

`apps/web/security-headers.conf`:
```nginx
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

`apps/web/nginx.conf`:
```nginx
# Log sin query string ($uri en lugar de $request_uri): los filtros nunca quedan en los logs.
log_format finanzas '$remote_addr [$time_local] "$request_method $uri" $status $body_bytes_sent $request_time';

server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  server_tokens off;
  client_max_body_size 1m;
  access_log /var/log/nginx/access.log finanzas;

  # DNS interno de Docker: si el contenedor api cambia de IP, nginx la vuelve a resolver.
  resolver 127.0.0.11 valid=10s ipv6=off;

  include /etc/nginx/snippets/security-headers.conf;

  location = /healthz {
    access_log off;
    default_type text/plain;
    return 200 'ok';
  }

  location /api/ {
    set $api_upstream http://api:3000;
    proxy_pass $api_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    proxy_read_timeout 60s;
  }

  location /assets/ {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
  }

  location / {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-cache" always;
    try_files $uri /index.html;
  }
}
```

`apps/web/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @finanzas/web --workspace @finanzas/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @finanzas/web

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
```

- [ ] **Step 5: Compose de producción, override local y variables**

`docker-compose.yml`:
```yaml
name: finanzas

services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-finanzas}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Define POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-finanzas}
      TZ: America/Bogota
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}']
      interval: 10s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://${POSTGRES_USER:-finanzas}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-finanzas}
      APP_URL: ${APP_URL:?Define APP_URL (https://tu-dominio)}
      ALLOW_REGISTRATION: ${ALLOW_REGISTRATION:-true}
      SESSION_TTL_DAYS: ${SESSION_TTL_DAYS:-30}
      CORS_ORIGINS: ${CORS_ORIGINS:-}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      TRUST_PROXY_HOPS: ${TRUST_PROXY_HOPS:-2}
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_SECURE: ${SMTP_SECURE:-false}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASS: ${SMTP_PASS:-}
      SMTP_FROM: ${SMTP_FROM:-Finanzas <no-reply@localhost>}
      TZ: America/Bogota

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    expose:
      - '8080'

  backup:
    image: prodrigestivill/postgres-backup-local:17
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      POSTGRES_HOST: db
      POSTGRES_DB: ${POSTGRES_DB:-finanzas}
      POSTGRES_USER: ${POSTGRES_USER:-finanzas}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      SCHEDULE: ${BACKUP_SCHEDULE:-@daily}
      BACKUP_KEEP_DAYS: ${BACKUP_KEEP_DAYS:-7}
      BACKUP_KEEP_WEEKS: ${BACKUP_KEEP_WEEKS:-4}
      BACKUP_KEEP_MONTHS: ${BACKUP_KEEP_MONTHS:-6}
      TZ: America/Bogota
    volumes:
      - backups:/backups

volumes:
  pgdata: {}
  backups: {}
```

`docker-compose.local.yml` (solo para probar en tu equipo; Dokploy no lo usa):
```yaml
services:
  web:
    ports:
      - '8080:8080'
  api:
    environment:
      TRUST_PROXY_HOPS: 1
```

`.env.example`:
```
# ==== Finanzas: variables para Docker Compose / Dokploy ====
# URL pública con https (sin barra final). En local: http://localhost:8080
APP_URL=https://finanzas.tudominio.com

# Base de datos. Usa una contraseña larga SOLO con letras y números (va dentro de una URL):
#   openssl rand -hex 24
POSTGRES_USER=finanzas
POSTGRES_PASSWORD=cambia-esta-clave-por-una-larga
POSTGRES_DB=finanzas

# Registro de usuarios nuevos (pon false cuando ya creaste tu cuenta)
ALLOW_REGISTRATION=true
SESSION_TTL_DAYS=30
LOG_LEVEL=info
# Saltos de proxy: Traefik (Dokploy) + nginx = 2
TRUST_PROXY_HOPS=2
# Solo si algún día sirves el frontend desde otro dominio (separados por comas)
CORS_ORIGINS=

# Correo para recuperar contraseña (opcional; sin SMTP no se envían correos en producción)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Finanzas <no-reply@tudominio.com>

# Backups automáticos (cron o @daily; retención)
BACKUP_SCHEDULE=@daily
BACKUP_KEEP_DAYS=7
BACKUP_KEEP_WEEKS=4
BACKUP_KEEP_MONTHS=6
```

`docker/backup/README.md`:
````markdown
# Backups y restauración

El servicio `backup` (imagen `prodrigestivill/postgres-backup-local`) ejecuta `pg_dump` según `BACKUP_SCHEDULE` y guarda archivos `.sql.gz` en el volumen `backups`:

- `/backups/daily`, `/backups/weekly`, `/backups/monthly`: copias con rotación (`BACKUP_KEEP_*`).
- `/backups/last/<db>-latest.sql.gz`: la copia más reciente.

## Ver las copias

```bash
docker compose exec backup ls -lh /backups/daily /backups/last
```

## Forzar una copia ahora

```bash
docker compose exec backup /backup.sh
```

## Restaurar la copia más reciente

```bash
docker compose stop api web
docker compose exec db psql -U finanzas -d finanzas -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
docker compose exec backup sh -c 'zcat /backups/last/finanzas-latest.sql.gz' | docker compose exec -T db psql -U finanzas -d finanzas
docker compose start api web
```

Para restaurar otra fecha, cambia la ruta por el archivo de `/backups/daily/…`.

## Copia fuera del servidor (recomendado)

Copia periódicamente el volumen a otro lugar, por ejemplo con `rclone` hacia S3, Google Drive o Backblaze, o descarga el archivo:

```bash
docker compose cp backup:/backups/last/finanzas-latest.sql.gz ./finanzas-$(date +%F).sql.gz
```
````

- [ ] **Step 6: Prueba de humo local con Docker**

Run:
```bash
cp .env.example .env
# editar .env: APP_URL=http://localhost:8080 y POSTGRES_PASSWORD=<hex aleatorio>
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
docker compose ps
```
Expected: `db`, `api` y `web` en estado `healthy`; `backup` en `running`. Si `npm ci --workspace …` falla en el Dockerfile por la selección de workspaces, reemplazar ese `RUN` por `npm ci` completo en la etapa `build` y por `npm ci --omit=dev` en `prod-deps` (más pesado, pero equivalente).

Run:
```bash
curl -s http://localhost:8080/healthz
curl -s http://localhost:8080/api/health
curl -s -i -c /tmp/fz.txt -H 'content-type: application/json' -H 'origin: http://localhost:8080' \
  -d '{"name":"Prueba","email":"prueba@example.com","password":"clave-segura-123"}' http://localhost:8080/api/auth/register
curl -s -b /tmp/fz.txt http://localhost:8080/api/dashboard
curl -s -I http://localhost:8080/ | grep -i -E 'content-security-policy|x-frame-options'
docker compose logs api | tail -n 20
docker compose exec backup /backup.sh && docker compose exec backup ls /backups/last
```
Expected: `ok`; `{"status":"ok"}`; `201` con `set-cookie: fz_session=…; HttpOnly; Secure; SameSite=Lax`; JSON del dashboard; cabeceras de seguridad presentes; logs con `route` y sin cuerpos ni montos; un archivo `finanzas-latest.sql.gz`. Abrir `http://localhost:8080` en el navegador, iniciar sesión con la cuenta de prueba y registrar un gasto.

Run: `docker compose -f docker-compose.yml -f docker-compose.local.yml down` (conserva los volúmenes) y borrar `.env` local si contiene datos de prueba.

---

### Task 23: README, verificación final de la Fase 1, commit y push

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación completa (spec, sección 50) y el commit único de la Fase 1 publicado en `origin/main`.

- [ ] **Step 1: Escribir `README.md`**

````markdown
# Finanzas

Aplicación web para controlar finanzas personales en **pesos colombianos (COP)**, pensada para usarse desde el celular. Responde en segundos: cuánto dinero tienes y dónde, cuánto debes, cuánto gastaste este mes y en qué, y te deja registrar un gasto en menos de 10 segundos.

> Finanzas es un asistente basado únicamente en los datos que registras. No es asesoría financiera profesional.

## Qué hace (Fase 1)

- Cuentas de dinero (efectivo, bancos, billeteras como Nequi o Daviplata, ahorro, inversión) con saldo calculado.
- Tarjetas de crédito con cupo, deuda, cuotas, día de corte y de pago, y "pago del mes" estimado.
- Préstamos con cuota mensual; los pagos separan capital (no es gasto) e intereses (sí es gasto).
- Siete tipos de movimiento que nunca cuentan dos veces el mismo dinero:

| Movimiento | Cuentas | Deuda | Gasto del mes |
|---|---|---|---|
| Ingreso | + | — | — |
| Gasto | − | — | + |
| Transferencia (incluye a ahorro) | − origen, + destino | — | — |
| Compra con tarjeta | sin cambio | + | + |
| Pago de tarjeta | − | − | — |
| Pago de préstamo (capital) | − | − | — |
| Desembolso de préstamo | + | + | — |

- Dashboard: dinero total, disponible estimado (con su desglose), deudas, patrimonio, balance del mes, cuentas, tarjetas y préstamos.
- Historial con búsqueda, filtros (fecha, tipo, cuenta, tarjeta, categoría, etiqueta, método, valor) y paginación.
- Multiusuario con aislamiento total: cada consulta se filtra por usuario en el backend y la base de datos rechaza referencias entre usuarios.

## Arquitectura

```
Navegador / celular ──HTTPS──► Traefik (Dokploy)
                                   │
                                   ▼
                       web: nginx (SPA + proxy /api)
                                   │ red interna
                                   ▼
                       api: Fastify + Prisma ──► db: PostgreSQL
                                                    ▲
                                       backup: pg_dump diario
```

- Un solo dominio: la SPA y la API comparten origen, así las cookies de sesión funcionan sin CORS.
- Toda la lógica financiera vive en funciones puras (`apps/api/src/domain`) con pruebas unitarias.
- Saldos y deudas nunca se guardan: se calculan desde los movimientos.

```
apps/api        API REST (Fastify 5, Prisma 7, PostgreSQL)
apps/web        Frontend (React 19, Vite, Tailwind 4)
packages/shared Esquemas Zod, tipos, formato COP y fechas (compartido)
docs/           Diseño y planes de implementación
```

## Tecnologías

Node 22 · TypeScript · Fastify 5 · Prisma 7 (adapter `pg`) · PostgreSQL 17 · Zod 4 · Argon2id · React 19 · Vite 8 · Tailwind CSS 4 · React Router 7 · TanStack Query 5 · Vitest · Docker · Dokploy.

## Requisitos

- Node.js 22.12 o superior y npm 10.
- Docker (para PostgreSQL en desarrollo y para producción).

## Instalación y desarrollo

```bash
npm install
npm run dev:db                      # Postgres de desarrollo (5432) y de pruebas (5433)
cp apps/api/.env.example apps/api/.env
npm run db:migrate -w @finanzas/api # aplica las migraciones
npm run db:seed -w @finanzas/api    # usuario de demostración
npm run dev:api                     # API en http://localhost:3000
npm run dev:web                     # App en http://localhost:5173 (proxy de /api a la API)
```

**Usuario de demostración (solo desarrollo):** `demo@example.com` / `Demo12345!`. El seed borra y recrea ese usuario con tres meses de movimientos; se niega a correr si `NODE_ENV=production`.

## Variables de entorno

Desarrollo: `apps/api/.env` (ver `apps/api/.env.example`). Producción: `.env` en la raíz o la pestaña Environment de Dokploy (ver `.env.example`).

| Variable | Descripción |
|---|---|
| `APP_URL` | URL pública con `https://`, sin barra final. Se usa para enlaces de recuperación y para validar el origen de las peticiones. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciales de la base. La contraseña solo con letras y números (`openssl rand -hex 24`). |
| `DATABASE_URL` | Solo en desarrollo; en Docker se arma con las variables anteriores. |
| `ALLOW_REGISTRATION` | `true`/`false`. Ciérralo después de crear tu cuenta. |
| `SESSION_TTL_DAYS` | Días sin uso antes de que la sesión expire (30). |
| `TRUST_PROXY_HOPS` | Proxies delante de la API: 2 en Dokploy (Traefik + nginx). |
| `CORS_ORIGINS` | Solo si el frontend se sirve desde otro dominio. |
| `LOG_LEVEL` | `info` por defecto. Los logs nunca incluyen cuerpos, montos, emails ni query strings. |
| `SMTP_*` | Servidor de correo para "Olvidé mi contraseña". Sin SMTP, en desarrollo el enlace aparece en el log de la API. |
| `BACKUP_*` | Frecuencia y retención de los backups. |

## Base de datos, Prisma y migraciones

- Esquema: `apps/api/prisma/schema.prisma`. Las restricciones `CHECK` (forma de cada tipo de movimiento, montos, porcentajes) están en la migración `constraints`.
- Crear una migración tras cambiar el esquema: `npm run db:migrate -w @finanzas/api -- --name descripcion`.
- Aplicar migraciones en producción: el contenedor `api` ejecuta `prisma migrate deploy` al arrancar.
- Regenerar el cliente: `npm run db:generate -w @finanzas/api`.

## Pruebas, lint y build

```bash
npm test            # shared + api (unitarias e integración contra Postgres en 5433) + web
npm run lint
npm run typecheck
npm run build
```

Las pruebas de integración recrean la base `finanzas_test` en cada corrida. Incluyen la correctitud financiera (transferir no es gasto, pagar tarjeta no es gasto nuevo, etc.) y el aislamiento entre usuarios.

## Docker (local)

```bash
cp .env.example .env    # APP_URL=http://localhost:8080 y una POSTGRES_PASSWORD aleatoria
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
# abrir http://localhost:8080
```

## Despliegue en Dokploy

1. En Dokploy crea un **Project** y dentro una aplicación tipo **Compose**. Conéctala a este repositorio (rama `main`, archivo `docker-compose.yml`).
2. En **Advanced**, activa **Isolated Deployment**. Así Dokploy crea una red propia para la aplicación, conecta todos los servicios a ella y conecta Traefik. `web` podrá llegar a `api` por nombre. Si no la activas, agrega tú la red `dokploy-network` (externa) a `web` y `api`.
3. En **Environment** pega el contenido de `.env.example` con tus valores reales: `APP_URL=https://finanzas.tudominio.com` y una `POSTGRES_PASSWORD` larga.
4. En **Domains** agrega el dominio:
   - Servicio: `web`.
   - Puerto del contenedor: `8080`.
   - Path: `/`.
   - HTTPS activado con certificado **Let's Encrypt**.

   No agregues dominio a `api`, `db` ni `backup`. Con **Preview Compose** puedes revisar las etiquetas de Traefik que Dokploy agregará.
5. **Despliega** (Deploy). Los cambios de dominio requieren volver a desplegar.
6. Verifica: `https://finanzas.tudominio.com/api/health` debe responder `{"status":"ok"}`.
7. Entra, crea tu cuenta y luego cambia `ALLOW_REGISTRATION=false` y vuelve a desplegar.

No uses `container_name` ni publiques puertos al host: Traefik enruta por la red interna.

### Dominio y HTTPS

- Crea un registro DNS **A** (o **AAAA**) de `finanzas.tudominio.com` apuntando a la IP pública del servidor de Dokploy.
- Traefik obtiene y renueva el certificado de Let's Encrypt automáticamente. Los puertos 80 y 443 del servidor deben estar abiertos.
- En producción la cookie de sesión es `Secure`, así que la app debe abrirse siempre por `https://`.

## Backups

El servicio `backup` hace `pg_dump` diario con rotación de 7 diarios, 4 semanales y 6 mensuales en el volumen `backups`. Los comandos para listar, forzar y restaurar copias están en [docker/backup/README.md](docker/backup/README.md).

Recomendación: copia también los backups fuera del servidor, por ejemplo con `rclone` a S3 o Google Drive. Alternativa: crear la base como servicio **Database** de Dokploy y programar sus backups a S3 desde el panel.

## Producción: lista de verificación

- [ ] `APP_URL` con `https://` y dominio definitivo.
- [ ] `POSTGRES_PASSWORD` larga y aleatoria; `.env` nunca en git.
- [ ] Isolated Deployment activado y dominio solo en `web:8080` con Let's Encrypt.
- [ ] `ALLOW_REGISTRATION=false` después de crear tu cuenta.
- [ ] SMTP configurado si quieres recuperar contraseñas por correo.
- [ ] Backup verificado (`docker compose exec backup ls /backups/last`) y copia fuera del servidor.

## Seguridad y privacidad

Contraseñas con Argon2id · sesiones en base de datos (cookie HttpOnly, Secure, SameSite=Lax), revocables · validación Zod en el backend · rate limiting · Helmet y CSP estricta · verificación de `Origin` contra CSRF · recursos ajenos responden 404 · logs sin datos financieros.
````

- [ ] **Step 2: Verificación completa**

Run:
```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
Expected: todo en verde. Si `format:check` falla, ejecutar `npm run format` y repetir.

Run: repetir la prueba de humo de Docker (Task 22, Step 6) con la imagen final.
Expected: mismos resultados.

- [ ] **Step 3: Revisar qué se va a subir**

Run: `git status --short` y `git check-ignore -v .env apps/api/.env apps/api/src/generated || true`
Expected: no aparecen `.env`, `node_modules`, `dist` ni `src/generated` entre los archivos a subir.

- [ ] **Step 4: Commit único de la Fase 1 y push**

```bash
git add -A
git commit -m "feat: implementa la fase 1 (núcleo funcional, frontend web responsive y despliegue Docker/Dokploy)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin main
```
Expected: push exitoso a `origin/main`.
