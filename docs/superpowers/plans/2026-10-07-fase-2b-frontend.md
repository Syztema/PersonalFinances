# Fase 2B — Interfaz web de la planificación, tema oscuro y "todo editable o eliminable": plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La web responsive (mobile first) de la Fase 2: tema oscuro por defecto, eliminar y restaurar en todas las pantallas de gestión, ajuste de saldo, edición total de movimientos, recurrentes con sugerencia de enlace, configuración financiera, presupuestos, metas, recurrentes y obligaciones, alertas, dashboard completo y perfil (email, eliminar mi cuenta); README, verificación final, prueba de humo con Docker y el commit único de la Fase 2.

**Architecture:** Igual que la Fase 1: React 19 + React Router 7 (rutas diferidas con `page()`), TanStack Query 5 (llaves en `lib/queries.ts`, invalidación con `invalidateFinance`), paneles inferiores (`Sheet`) para formularios, componentes de `components/ui`. Todo el cálculo lo hace la API (plan 2A); la web solo muestra y envía. El tema se aplica con la clase `dark` en `<html>`: un script propio (`public/theme-init.js`, la CSP no permite scripts en línea) lo pone antes del primer pintado y la app lo sincroniza con el usuario.

**Tech Stack:** React 19, Vite 8, Tailwind 4 (tokens en `index.css`), React Router 7.18, TanStack Query 5, Radix Dialog, lucide-react 1.x, Vitest 5 + Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-07-fase-2-design.md` (addendum de la Fase 2) y `docs/superpowers/specs/2026-10-06-finanzas-design.md` (spec principal). Contratos de la API: plan `docs/superpowers/plans/2026-10-07-fase-2a-backend.md` (DTOs en `packages/shared/src/dto.ts`).

## Global Constraints

- Solo sitio web responsive (mobile first, 360/375/390/412 px); nada de aplicaciones nativas. Zonas de toque ≥ 44 px (`min-h-11`), inputs ≥ 16 px, contraste AA en claro y oscuro.
- Textos en español de Colombia; dinero con `Amount`/`formatCOP` (`$1.500.000`); fechas cortas con `formatShortDate` (`05 oct`).
- Colores solo con tokens semánticos (`bg-surface`, `text-fg`, `text-muted`, `bg-primary`, `text-positive`, `text-negative`, `text-warning`, …). Nada de `bg-slate-*`, `text-white` sobre tokens ni colores fijos nuevos (excepto los colores que elige el usuario para cuentas y categorías).
- La CSP es `script-src 'self'`: ningún script en línea.
- Los filtros y montos no viajan en la URL del navegador (solo en las peticiones a la API).
- Cada mutación invalida lo necesario con `invalidateFinance` (o `useCrudMutation`, que ya lo hace) y avisa con un toast.
- Acciones destructivas con `ConfirmButton` (doble toque).
- Formularios: errores del servidor con `toFormErrors`; un doble toque nunca envía dos veces.
- Antes de dar por terminada cada tarea: `npm run typecheck` (raíz), `npm test -w @finanzas/web` y `npm run lint` en verde.
- Commits: se sigue en la rama `fase-2`; cada tarea termina con un commit de trabajo (sin push). La Task 14 aplasta todo en **un único commit** en `main` con mensaje de una frase y hace `git push origin main`.

## Review Focus

1. **Doble toque en "Pagar" de una obligación** → una sola petición `POST /scheduled/:id/complete`; el botón queda deshabilitado mientras se guarda. *(Test en Task 10.)*
2. **Recargar con el tema claro guardado** → `theme-init.js` aplica el tema antes de pintar (sin destello oscuro) y sin `localStorage` disponible cae en oscuro sin romperse. *(Test en Task 1.)*
3. **"Recurrente" quincenal registrado un día cualquiera (por ejemplo el 30 de octubre o el último día de febrero)** → los días que se envían incluyen la fecha del movimiento, para que la API no lo rechace. *(Test en Task 6.)*
4. **Eliminar una cuenta que aún tiene dinero** → se muestra el mensaje de la API (cuánto queda y cómo dejarla en $0), no un error genérico. *(Test en Task 3.)*
5. **Editar un movimiento de una cuenta eliminada** → valor, fecha y medio de pago bloqueados con la explicación; cambiar la descripción sí se guarda. *(Test en Task 5.)*

---

## Estructura de archivos (Fase 2B)

```
apps/web/
  index.html                       script theme-init y theme-color oscuro
  public/theme-init.js             aplica el tema antes del primer pintado
  package.json                     sin la dependencia zod (no se usa)
  src/index.css                    paleta oscura y tokens negative-fg / warning-fg
  src/lib/theme.ts (+ test)        storedTheme, applyTheme, useThemeSync
  src/lib/api.ts (+ test)          del con cuerpo y respuesta
  src/lib/queries.ts               llaves y hooks de la Fase 2
  src/lib/format.ts (+ test)       formatMonthYear
  src/lib/icons.tsx                target, plane, car
  src/components/ui/Button.tsx, Toast.tsx           colores por token
  src/components/ui/ProgressBar.tsx, DeletedSection.tsx (+ tests)
  src/app/AppLayout.tsx            sincroniza el tema del usuario
  src/app/navigation.ts, router.tsx                 Metas, Recurrentes, Alertas, Configuración
  src/features/accounts/           eliminar/restaurar, sobregiro, AdjustBalanceSheet
  src/features/cards/, debts/      eliminar/restaurar, saldo a favor
  src/features/categories/         sistema visible, eliminar/restaurar, TagsList
  src/features/transactions/       "(eliminada)", sin parpadeo, validación de fechas
  src/features/quick-add/          cambio gasto ⇄ tarjeta, movimientos congelados, desembolso,
                                   recurrente, "¿Es el pago de X?"
  src/features/budgets/            BudgetsPage, BudgetEditorSheet (reemplaza more/BudgetsPage)
  src/features/goals/              GoalsPage, GoalFormSheet, GoalMoneySheet
  src/features/recurring/          RecurringPage, RuleFormSheet, ScheduledFormSheet, CompleteSheet
  src/features/alerts/             AlertsPage, AlertItem
  src/features/settings/           SettingsPage
  src/features/dashboard/          SpendingPowerCard, SpendingPowerSheet, StatusCard, GoalsSection,
                                   MonthCard, DashboardPage
  src/features/profile/            ThemeCard, EmailCard, DeleteAccountCard, ProfilePage
  src/test-utils.tsx               demoUser con tema oscuro
README.md
```

---

### Task 1: Tema oscuro por defecto

**Files:**
- Modify: `apps/web/src/index.css`
- Create: `apps/web/public/theme-init.js`
- Modify: `apps/web/index.html`
- Create: `apps/web/src/lib/theme.ts`, `apps/web/src/lib/theme.test.ts`
- Modify: `apps/web/src/components/ui/Button.tsx:11`, `apps/web/src/components/ui/Toast.tsx:34-37`
- Modify: `apps/web/src/app/AppLayout.tsx`
- Create: `apps/web/src/features/profile/ThemeCard.tsx`
- Modify: `apps/web/src/features/profile/ProfilePage.tsx`
- Create: `apps/web/src/features/profile/ProfilePage.test.tsx`
- Modify: `apps/web/src/test-utils.tsx` (`demoUser.theme`)

**Interfaces:**
- Consumes: `Theme`, `THEME_LABELS`, `UserDTO` de `@finanzas/shared`; `PATCH /api/me { theme }` (Fase 1, default `DARK` desde la Task 2 del plan 2A).
- Produces:
  - `THEME_KEY = 'fz:theme'`, `storedTheme(): Theme` (default `DARK`), `isDark(theme: Theme): boolean`, `applyTheme(theme: Theme): void` (clase `dark` en `<html>`, `meta[name=theme-color]`, `localStorage`), `useThemeSync(theme: Theme | undefined): void` (sigue al sistema cuando es `SYSTEM`).
  - Tokens nuevos: `negative-fg` y `warning-fg` (`text-negative-fg`, `text-warning-fg`).
  - `ThemeCard({ user })`: selector Oscuro / Claro / Según el sistema con actualización optimista.

- [ ] **Step 1: Escribir los tests**

Create `apps/web/src/lib/theme.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import initScript from '../../public/theme-init.js?raw';
import { applyTheme, storedTheme, THEME_KEY } from './theme';

const html = document.documentElement;
const themeColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

beforeEach(() => {
  localStorage.clear();
  html.classList.remove('dark');
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
});
afterEach(() => vi.unstubAllGlobals());

describe('theme', () => {
  it('is dark by default', () => {
    expect(storedTheme()).toBe('DARK');
  });

  it('applies the class, the browser color and remembers the choice', () => {
    applyTheme('LIGHT');
    expect(html.classList.contains('dark')).toBe(false);
    expect(themeColor()).toBe('#f5f6f8');
    expect(localStorage.getItem(THEME_KEY)).toBe('LIGHT');
    applyTheme('DARK');
    expect(html.classList.contains('dark')).toBe(true);
    expect(themeColor()).toBe('#0b1016');
  });

  it('follows the system preference when the theme is SYSTEM', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    applyTheme('SYSTEM');
    expect(html.classList.contains('dark')).toBe(false);
  });
});

describe('theme-init.js (review focus #2)', () => {
  it('applies the stored light theme before the app loads', () => {
    localStorage.setItem(THEME_KEY, 'LIGHT');
    html.classList.add('dark');
    new Function(initScript)();
    expect(html.classList.contains('dark')).toBe(false);
    expect(themeColor()).toBe('#f5f6f8');
  });

  it('falls back to dark when storage is not available', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('bloqueado');
      },
    });
    new Function(initScript)();
    expect(html.classList.contains('dark')).toBe(true);
  });
});
```

Create `apps/web/src/features/profile/ProfilePage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { ProfilePage } from './ProfilePage';

afterEach(() => vi.unstubAllGlobals());

describe('ProfilePage — appearance', () => {
  it('switches to the light theme right away and saves it', async () => {
    const patches: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'PATCH /me': (body) => {
        patches.push(body);
        return { status: 200, body: { user: { ...demoUser, theme: 'LIGHT' } } };
      },
    });
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Claro' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    await waitFor(() => expect(patches).toEqual([{ theme: 'LIGHT' }]));
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute('aria-checked', 'true');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/lib/theme.test.ts src/features/profile/ProfilePage.test.tsx`
Expected: FAIL (no existen `theme.ts` ni `theme-init.js`; el perfil no tiene selector de tema).

- [ ] **Step 2b: El usuario de prueba usa el tema oscuro**

En `apps/web/src/test-utils.tsx`, cambiar `theme: 'SYSTEM',` por `theme: 'DARK',` en `demoUser`.

- [ ] **Step 3: Paleta oscura y tokens nuevos**

En `apps/web/src/index.css`:

1. Dentro de `@theme inline { … }`, debajo de `--color-warning: var(--warning);`:

```css
  --color-negative-fg: var(--negative-fg);
  --color-warning-fg: var(--warning-fg);
```

2. En `:root { … }`, debajo de `--warning: #b45309;`:

```css
  --negative-fg: #ffffff;
  --warning-fg: #ffffff;
```

3. Después del bloque `:root { … }`:

```css
/* Addendum §5: paleta oscura (contraste AA). La clase la pone public/theme-init.js. */
:root.dark {
  --bg: #0b1016;
  --surface: #121a22;
  --surface-2: #1a2430;
  --border: #263241;
  --fg: #e6edf3;
  --muted: #93a1b0;
  --primary: #2dd4bf;
  --primary-fg: #04201c;
  --positive: #4ade80;
  --negative: #fb7185;
  --negative-fg: #1f0710;
  --warning: #fbbf24;
  --warning-fg: #1f1300;
  color-scheme: dark;
}
```

En `apps/web/src/components/ui/Button.tsx` (variante `danger`):

```ts
  danger: 'bg-negative text-negative-fg hover:opacity-90',
```

En `apps/web/src/components/ui/Toast.tsx`, reemplazar las clases de cada toast:

```tsx
            className={cn(
              'pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-sm shadow-lg',
              t.tone === 'success' && 'bg-fg text-bg',
              t.tone === 'warning' && 'bg-warning text-warning-fg',
              t.tone === 'error' && 'bg-negative text-negative-fg',
            )}
```

- [ ] **Step 4: Script de arranque del tema**

Create `apps/web/public/theme-init.js`:

```js
// Aplica el tema guardado antes del primer pintado (la CSP no permite scripts en línea).
(function () {
  var theme = 'DARK';
  try {
    theme = localStorage.getItem('fz:theme') || 'DARK';
  } catch (e) {
    theme = 'DARK';
  }
  var dark =
    theme === 'DARK' ||
    (theme === 'SYSTEM' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b1016' : '#f5f6f8');
})();
```

En `apps/web/index.html`, cambiar la línea del `theme-color` y agregar el script justo después:

```html
    <meta name="theme-color" content="#0b1016" />
    <script src="/theme-init.js"></script>
```

(Vite avisa que no puede empaquetar un script sin `type="module"`: es lo esperado; se copia tal cual desde `public/`.)

- [ ] **Step 5: Módulo de tema**

Create `apps/web/src/lib/theme.ts`:

```ts
import type { Theme } from '@finanzas/shared';
import { useEffect } from 'react';

export const THEME_KEY = 'fz:theme';
const BROWSER_COLOR = { dark: '#0b1016', light: '#f5f6f8' };
const QUERY = '(prefers-color-scheme: dark)';

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'LIGHT' || value === 'SYSTEM' ? value : 'DARK';
  } catch {
    return 'DARK';
  }
}

export function isDark(theme: Theme): boolean {
  if (theme === 'DARK') return true;
  if (theme === 'LIGHT') return false;
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/** Misma lógica que public/theme-init.js; además recuerda la elección en este dispositivo. */
export function applyTheme(theme: Theme): void {
  const dark = isDark(theme);
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? BROWSER_COLOR.dark : BROWSER_COLOR.light);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // sin almacenamiento: el tema se aplica igual en esta visita
  }
}

/** Aplica el tema del usuario y, si es "Según el sistema", sigue los cambios del sistema. */
export function useThemeSync(theme: Theme | undefined): void {
  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    if (theme !== 'SYSTEM' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(QUERY);
    const onChange = () => applyTheme('SYSTEM');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);
}
```

En `apps/web/src/app/AppLayout.tsx`:

```tsx
import { Outlet } from 'react-router';
import { useMe } from '../features/auth/useAuth';
import { useSessionExpiry } from '../features/auth/useSessionExpiry';
import { QuickAddProvider } from '../features/quick-add/QuickAddContext';
import { QuickAddSheets } from '../features/quick-add/QuickAddSheets';
import { useThemeSync } from '../lib/theme';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  useSessionExpiry();
  const me = useMe();
  useThemeSync(me.data?.theme);
  return (
```

(el resto del componente no cambia).

- [ ] **Step 6: Selector de tema en el perfil**

Create `apps/web/src/features/profile/ThemeCard.tsx`:

```tsx
import { THEME_LABELS, type Theme, type UserDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardTitle } from '../../components/ui/Card';
import { Chips } from '../../components/ui/Chips';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries';
import { applyTheme } from '../../lib/theme';

const ORDER: Theme[] = ['DARK', 'LIGHT', 'SYSTEM'];

export function ThemeCard({ user }: { user: UserDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (theme: Theme) => api.patch<{ user: UserDTO }>('/me', { theme }),
    onMutate: (theme) => {
      applyTheme(theme);
      queryClient.setQueryData(qk.me, { ...user, theme });
    },
    onSuccess: ({ user: updated }) => queryClient.setQueryData(qk.me, updated),
    onError: () => {
      applyTheme(user.theme);
      queryClient.setQueryData(qk.me, user);
      toast.show({ message: 'No se pudo guardar el tema', tone: 'error' });
    },
  });
  return (
    <Card>
      <CardTitle>Apariencia</CardTitle>
      <div className="mt-3">
        <Chips
          ariaLabel="Tema"
          value={user.theme}
          onChange={(theme) => save.mutate(theme)}
          options={ORDER.map((t) => ({ value: t, label: THEME_LABELS[t] }))}
        />
      </div>
    </Card>
  );
}
```

En `apps/web/src/features/profile/ProfilePage.tsx`, importar `ThemeCard` y renderizarlo justo después del `<h1>`:

```tsx
      <h1 className="text-2xl font-semibold">Perfil y seguridad</h1>
      <ThemeCard user={user} />
```

- [ ] **Step 7: Verificar**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS. Revisión manual rápida: `npm run dev:web` y abrir http://localhost:5173 con el tema oscuro; tarjetas, textos atenuados, botones peligrosos y toasts legibles.

- [ ] **Step 8: Commit de trabajo**

```bash
git add -A && git commit -m "feat(web): tema oscuro por defecto con selector en el perfil"
```

---

### Task 2: Base de la interfaz de la Fase 2 (cliente, consultas y componentes)

**Files:**
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/lib/api.test.ts`
- Modify: `apps/web/src/lib/queries.ts`
- Modify: `apps/web/src/lib/format.ts`, `apps/web/src/lib/format.test.ts`
- Modify: `apps/web/src/lib/icons.tsx`
- Create: `apps/web/src/components/ui/ProgressBar.tsx`, `apps/web/src/components/ui/DeletedSection.tsx`
- Create: `apps/web/src/components/ui/ProgressBar.test.tsx`, `apps/web/src/components/ui/DeletedSection.test.tsx`
- Modify: `apps/web/package.json` (quitar `zod`), `package-lock.json`

**Interfaces:**
- Consumes: DTOs de la Fase 2 (`GoalDTO`, `RecurringRuleDTO`, `ScheduledItemDTO`, `BudgetDTO`, `FinancialSettingsResponse`, `AlertDTO`, `StatusDTO`).
- Produces:
  - `api.del<T = void>(path: string, body?: unknown): Promise<T>`
  - `qk.goals`, `qk.recurring`, `qk.scheduled`, `qk.budgets`, `qk.budget(month)`, `qk.settings`, `qk.alerts`; `invalidateFinance` también invalida esas llaves.
  - Hooks: `useGoals()`, `useRules()`, `useScheduled(params: string)`, `useBudget(month: string)`, `useFinancialSettings()`, `useAlerts()`.
  - `formatMonthYear(key: string): string` (`octubre de 2026`).
  - Íconos `target`, `plane`, `car`.
  - `<ProgressBar value label tone? />` (ámbar desde 75 %, rojo desde 90 %; `tone="positive"` para metas).
  - `<DeletedSection items onRestore restoringId />` (lista plegable "Eliminados (n)" con "Restaurar").

- [ ] **Step 1: Escribir los tests**

En `apps/web/src/lib/api.test.ts`, dentro del `describe('api client', …)`, agregar:

```ts
  it('sends a JSON body with DELETE and returns the response', async () => {
    const fetchMock = mockFetch(200, { deleted: 'soft' });
    const result = await api.del<{ deleted: string }>('/me', { password: 'x' });
    expect(result).toEqual({ deleted: 'soft' });
    expect(fetchMock).toHaveBeenCalledWith('/api/me', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{"password":"x"}',
    });
  });
```

En `apps/web/src/lib/format.test.ts`, agregar (importando `formatMonthYear`):

```ts
describe('formatMonthYear', () => {
  it('names the month and the year', () => {
    expect(formatMonthYear('2026-10')).toBe('octubre de 2026');
    expect(formatMonthYear('2027-01')).toBe('enero de 2027');
  });
});
```

Create `apps/web/src/components/ui/ProgressBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

const bar = (value: number, tone?: 'auto' | 'positive') => {
  render(<ProgressBar value={value} label="Uso" tone={tone} />);
  return screen.getByRole('progressbar', { name: 'Uso' });
};

describe('ProgressBar', () => {
  it('reports the percentage and caps the width at 100 %', () => {
    const el = bar(1.3);
    expect(el).toHaveAttribute('aria-valuenow', '130');
    expect((el.firstElementChild as HTMLElement).style.width).toBe('100%');
  });

  it('uses the primary color below 75 %', () => {
    expect(bar(0.5).firstElementChild).toHaveClass('bg-primary');
  });
  it('turns amber at 75 %', () => {
    expect(bar(0.75).firstElementChild).toHaveClass('bg-warning');
  });
  it('turns red at 90 %', () => {
    expect(bar(0.9).firstElementChild).toHaveClass('bg-negative');
  });
  it('goals always look positive', () => {
    expect(bar(0.95, 'positive').firstElementChild).toHaveClass('bg-positive');
  });
});
```

Create `apps/web/src/components/ui/DeletedSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeletedSection } from './DeletedSection';

describe('DeletedSection', () => {
  it('stays folded until opened and restores an item', async () => {
    const onRestore = vi.fn();
    render(
      <DeletedSection items={[{ id: 'a9', name: 'Vieja' }]} onRestore={onRestore} restoringId={null} />,
    );
    expect(screen.queryByText('Vieja')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Vieja' }));
    expect(onRestore).toHaveBeenCalledWith({ id: 'a9', name: 'Vieja' });
  });

  it('renders nothing without deleted items', () => {
    const { container } = render(<DeletedSection items={[]} onRestore={() => undefined} restoringId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/lib src/components/ui`
Expected: FAIL (`api.del` no envía cuerpo ni devuelve datos; módulos inexistentes).

- [ ] **Step 3: Cliente y consultas**

En `apps/web/src/lib/api.ts`, cambiar la línea de `del`:

```ts
  del: <T = void>(path: string, body?: unknown) => request<T>('DELETE', path, body),
```

Reemplazar el contenido de `apps/web/src/lib/queries.ts` por:

```ts
import type {
  AccountDTO,
  AlertDTO,
  BudgetDTO,
  CategoryDTO,
  CreditCardDTO,
  DebtDTO,
  FinancialSettingsResponse,
  GoalDTO,
  RecurringRuleDTO,
  ScheduledItemDTO,
  StatusDTO,
} from '@finanzas/shared';
import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
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
  goals: ['goals'] as const,
  recurring: ['recurring'] as const,
  scheduled: ['scheduled'] as const,
  budgets: ['budgets'] as const,
  budget: (month: string) => ['budgets', month] as const,
  settings: ['settings'] as const,
  alerts: ['alerts'] as const,
};

/** Después de cualquier cambio de dinero o de planificación, todo lo calculado puede cambiar. */
export function invalidateFinance(queryClient: QueryClient) {
  return Promise.all(
    [
      qk.dashboard,
      qk.accounts,
      qk.cards,
      qk.debts,
      qk.transactions,
      qk.tags,
      qk.goals,
      qk.recurring,
      qk.scheduled,
      qk.budgets,
      qk.settings,
      qk.alerts,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

const items = <T>(path: string) => api.get<{ items: T[] }>(path).then((r) => r.items);

export const useAccounts = () =>
  useQuery({ queryKey: qk.accounts, queryFn: () => items<AccountDTO>('/accounts') });
export const useCards = () =>
  useQuery({ queryKey: qk.cards, queryFn: () => items<CreditCardDTO>('/credit-cards') });
export const useDebts = () =>
  useQuery({ queryKey: qk.debts, queryFn: () => items<DebtDTO>('/debts') });
export const useCategories = () =>
  useQuery({
    queryKey: qk.categories,
    queryFn: () => items<CategoryDTO>('/categories'),
    staleTime: 5 * 60_000,
  });
export const useGoals = () =>
  useQuery({ queryKey: qk.goals, queryFn: () => items<GoalDTO>('/goals') });
export const useRules = () =>
  useQuery({ queryKey: qk.recurring, queryFn: () => items<RecurringRuleDTO>('/recurring') });
export const useScheduled = (params: string) =>
  useQuery({
    queryKey: [...qk.scheduled, params],
    queryFn: () => items<ScheduledItemDTO>(`/scheduled?${params}`),
  });
export const useBudget = (month: string) =>
  useQuery({
    queryKey: qk.budget(month),
    queryFn: () => api.get<{ budget: BudgetDTO }>(`/budgets/${month}`).then((r) => r.budget),
    placeholderData: keepPreviousData,
  });
export const useFinancialSettings = () =>
  useQuery({
    queryKey: qk.settings,
    queryFn: () => api.get<FinancialSettingsResponse>('/settings/financial'),
  });
export const useAlerts = () =>
  useQuery({
    queryKey: qk.alerts,
    queryFn: () => api.get<{ items: AlertDTO[]; status: StatusDTO }>('/alerts'),
  });
```

- [ ] **Step 4: Formato e íconos**

En `apps/web/src/lib/format.ts`, al final:

```ts
/** `octubre de 2026` */
export const formatMonthYear = (key: string) => `${MONTHS[monthIndex(key)] ?? key} de ${key.slice(0, 4)}`;
```

En `apps/web/src/lib/icons.tsx`, importar `Car`, `Plane` y `Target` de `lucide-react` y agregar al mapa `ICONS`:

```ts
  car: Car,
  plane: Plane,
  target: Target,
```

- [ ] **Step 5: Componentes**

Create `apps/web/src/components/ui/ProgressBar.tsx`:

```tsx
import { cn } from '../../lib/cn';

/** Barra de avance: ámbar desde 75 %, roja desde 90 % (addendum §6.2); las metas siempre en verde. */
export function ProgressBar({
  value,
  label,
  tone = 'auto',
}: {
  value: number;
  label: string;
  tone?: 'auto' | 'positive';
}) {
  const pct = Math.max(0, Math.round(value * 100));
  const color =
    tone === 'positive'
      ? 'bg-positive'
      : value >= 0.9
        ? 'bg-negative'
        : value >= 0.75
          ? 'bg-warning'
          : 'bg-primary';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 overflow-hidden rounded-full bg-surface-2"
    >
      <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}
```

Create `apps/web/src/components/ui/DeletedSection.tsx`:

```tsx
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';

/** Addendum §3.1: lo eliminado queda plegado al final de cada pantalla de gestión, con "Restaurar". */
export function DeletedSection<T extends { id: string; name: string }>({
  items,
  onRestore,
  restoringId,
}: {
  items: T[];
  onRestore: (item: T) => void;
  restoringId: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between px-1 text-sm text-muted"
      >
        Eliminados ({items.length})
        <ChevronDown size={16} className={open ? 'rotate-180' : ''} aria-hidden />
      </button>
      {open && (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {items.map((item) => (
              <li key={item.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0 truncate text-muted">{item.name}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Restaurar ${item.name}`}
                  loading={restoringId === item.id}
                  onClick={() => onRestore(item)}
                >
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-xs text-muted">
            Lo eliminado conserva su historial en Movimientos. Restáuralo para volver a usarlo.
          </p>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Quitar la dependencia sin uso**

Run: `grep -rn "from 'zod'" apps/web/src || echo "sin usos"`
Expected: `sin usos`. Entonces:

```bash
npm uninstall zod -w @finanzas/web
```

Expected: `apps/web/package.json` ya no lista `zod` (sigue en `packages/shared` y `apps/api`).

- [ ] **Step 7: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): base de consultas y componentes para la fase 2"
```

---

### Task 3: Cuentas — eliminar y restaurar, sobregiro y ajustar saldo

**Files:**
- Modify: `apps/web/src/test-utils.tsx` (helper `confirmTwice`)
- Modify: `apps/web/src/features/accounts/AccountsPage.tsx`
- Modify: `apps/web/src/features/accounts/AccountFormSheet.tsx`
- Create: `apps/web/src/features/accounts/AdjustBalanceSheet.tsx`
- Modify: `apps/web/src/features/accounts/AccountsPage.test.tsx`

**Interfaces:**
- Consumes: `DELETE /api/accounts/:id` → `{ deleted }` o 409 con mensaje; `POST /api/accounts/:id/restore`; `POST /api/accounts/:id/adjust { actualBalance, date }` (plan 2A, Tasks 8 y 9); `DeletedSection` (Task 2).
- Produces:
  - `confirmTwice(name: string): Promise<void>` en `test-utils.tsx` (requiere `vi.useFakeTimers({ shouldAdvanceTime: true })`).
  - `AccountFormSheet({ open, onOpenChange, account?, onAdjust? })` — botones "Ajustar saldo" y "Eliminar cuenta"; interruptor "Saldo negativo (sobregiro)".
  - `AdjustBalanceSheet({ account: AccountDTO | null, onClose })`.

- [ ] **Step 1: Helper para el doble toque en tests**

En `apps/web/src/test-utils.tsx`, agregar los imports `import { screen } from '@testing-library/react';` (junto a `render`) e `import userEvent from '@testing-library/user-event';`, y al final:

```ts
/** Doble toque de ConfirmButton (exige 400 ms entre toques). Usar con vi.useFakeTimers({ shouldAdvanceTime: true }). */
export async function confirmTwice(name: string) {
  await userEvent.click(screen.getByRole('button', { name }));
  await vi.advanceTimersByTimeAsync(500);
  await userEvent.click(screen.getByRole('button', { name: '¿Seguro? Toca de nuevo' }));
}
```

- [ ] **Step 2: Escribir los tests**

En `apps/web/src/features/accounts/AccountsPage.test.tsx`:

1. Imports: `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';` y `import { confirmTwice, demoUser, mockApi, renderWithProviders } from '../../test-utils';`. Debajo del `afterEach` existente:

```ts
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());
```

2. Reemplazar el test `'shows the API reason when archiving is not allowed'` por:

```tsx
  it('explains how to leave the balance at $0 when it cannot be deleted (review focus #4)', async () => {
    const message =
      'La cuenta tiene un saldo de $1.500.000. Déjala en $0 antes de eliminarla: transfiere el dinero, ajusta el saldo o corrige el saldo inicial.';
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'DELETE /accounts/a1': () => ({
        status: 409,
        body: { error: { code: 'ACCOUNT_HAS_BALANCE', message } },
      }),
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByText('Bancolombia'));
    await confirmTwice('Eliminar cuenta');
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('keeps deleted accounts folded under Eliminados and restores them', async () => {
    const restored: string[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({
        status: 200,
        body: { items: [bancolombia, { ...bancolombia, id: 'a9', name: 'Vieja', isActive: false, balance: 0 }] },
      }),
      'POST /accounts/a9/restore': () => {
        restored.push('a9');
        return { status: 200, body: { account: { ...bancolombia, id: 'a9', name: 'Vieja' } } };
      },
    });
    renderWithProviders(<AccountsPage />);
    await screen.findByText('Bancolombia');
    expect(screen.queryByText('Vieja')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Vieja' }));
    await waitFor(() => expect(restored).toEqual(['a9']));
  });

  it('creates an overdrawn account with a negative initial balance', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [] } }),
      'POST /accounts': (body) => {
        posted.push(body);
        return { status: 201, body: { account: bancolombia } };
      },
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Cuenta corriente');
    await userEvent.type(screen.getByLabelText('Saldo actual'), '50000');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Saldo negativo (sobregiro)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cuenta' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ name: 'Cuenta corriente', initialBalance: -50_000 });
  });

  it('adjusts the balance to the real one', async () => {
    const adjusted: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bancolombia] } }),
      'POST /accounts/a1/adjust': (body) => {
        adjusted.push(body);
        return { status: 201, body: { transaction: { id: 't1' }, account: bancolombia } };
      },
    });
    renderWithProviders(<AccountsPage />);
    await userEvent.click(await screen.findByText('Bancolombia'));
    await userEvent.click(screen.getByRole('button', { name: 'Ajustar saldo' }));
    await userEvent.type(await screen.findByLabelText('Saldo real hoy'), '1600000');
    expect(screen.getByText(/Se registrará un ingreso de/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }));
    await waitFor(() =>
      expect(adjusted).toEqual([{ actualBalance: 1_600_000, date: expect.any(String) }]),
    );
  });
```

3. En `'sums archived accounts into the total like the dashboard does'`, cambiar el nombre a `'sums deleted accounts into the total like the dashboard does'` (el cuerpo no cambia).

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/features/accounts`
Expected: FAIL (no hay "Eliminar cuenta", "Eliminados", sobregiro ni "Ajustar saldo").

- [ ] **Step 4: Formulario de cuenta**

Reemplazar el contenido de `apps/web/src/features/accounts/AccountFormSheet.tsx` por:

```tsx
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  formatCOP,
  type AccountDTO,
  type AccountType,
  type DeleteResultDTO,
} from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
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

export function AccountFormSheet({
  open,
  onOpenChange,
  account,
  onAdjust,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: AccountDTO;
  onAdjust?: (account: AccountDTO) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={account ? 'Editar cuenta' : 'Nueva cuenta'}
    >
      {open && (
        <AccountForm account={account} onDone={() => onOpenChange(false)} onAdjust={onAdjust} />
      )}
    </Sheet>
  );
}

function AccountForm({
  account,
  onDone,
  onAdjust,
}: {
  account?: AccountDTO;
  onDone: () => void;
  onAdjust?: (account: AccountDTO) => void;
}) {
  const today = useToday();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'BANK');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [initialBalance, setInitialBalance] = useState<number | null>(
    account ? Math.abs(account.initialBalance) : null,
  );
  const [negative, setNegative] = useState((account?.initialBalance ?? 0) < 0);
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? today);
  const [icon, setIcon] = useState(account?.icon ?? DEFAULT_ICON.BANK);
  const [iconTouched, setIconTouched] = useState(!!account);
  const [color, setColor] = useState(account?.color ?? '#0f766e');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      account ? api.put(`/accounts/${account.id}`, body) : api.post('/accounts', body),
    account ? 'Cuenta actualizada' : 'Cuenta creada',
  );
  const remove = useCrudMutation(
    () => api.del<DeleteResultDTO>(`/accounts/${account!.id}`),
    'Cuenta eliminada',
  );
  const onError = (err: ApiError) => {
    const mapped = toFormErrors(err, ['name', 'initialBalance']);
    setFields(mapped);
    setError(mapped._ ?? null);
  };

  const submit = () => {
    if (!name.trim()) return setFields({ name: 'Escribe un nombre' });
    save.mutate(
      {
        name,
        type,
        institution: institution || null,
        initialBalance: (negative ? -1 : 1) * (initialBalance ?? 0),
        openingDate,
        icon,
        color,
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
      <Field label="Nombre" htmlFor="acc-name" error={fields.name}>
        <TextInput
          id="acc-name"
          maxLength={60}
          placeholder="Bancolombia, Nequi, Efectivo…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="Tipo"
        htmlFor="acc-type"
        hint={
          type === 'SAVINGS' || type === 'INVESTMENT'
            ? 'Cuenta en el dinero total, pero no en el disponible.'
            : undefined
        }
      >
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
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Entidad (opcional)" htmlFor="acc-inst">
        <TextInput
          id="acc-inst"
          maxLength={60}
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
      </Field>
      <Field
        label={account ? 'Saldo inicial (al registrar la cuenta)' : 'Saldo actual'}
        htmlFor="acc-balance"
        error={fields.initialBalance}
        hint={
          account
            ? `Tu saldo de hoy es ${formatCOP(account.balance)}. Para corregir el saldo de hoy usa "Ajustar saldo"; cambia este valor solo si el saldo inicial quedó mal registrado.`
            : 'El saldo que tiene hoy. Los movimientos que registres lo irán ajustando.'
        }
      >
        <MoneyInput id="acc-balance" value={initialBalance} onChange={setInitialBalance} />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={negative}
          onChange={(e) => setNegative(e.target.checked)}
        />
        Saldo negativo (sobregiro)
      </label>
      <Field
        label="Fecha de apertura en la app"
        htmlFor="acc-date"
        hint="Movimientos anteriores a esta fecha ya están incluidos en el saldo."
      >
        <TextInput
          id="acc-date"
          type="date"
          max={today}
          value={openingDate}
          onChange={(e) => e.target.value && setOpeningDate(e.target.value)}
        />
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
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar cuenta
      </Button>
      {account && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => onAdjust?.(account)}>
              Ajustar saldo
            </Button>
            <ConfirmButton
              loading={remove.isPending}
              onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
            >
              Eliminar cuenta
            </ConfirmButton>
          </div>
          <p className="text-xs text-muted">
            Para eliminarla debe tener saldo $0. Si tiene movimientos, se oculta y su historial se
            conserva.
          </p>
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 5: Ajustar saldo**

Create `apps/web/src/features/accounts/AdjustBalanceSheet.tsx`:

```tsx
import type { AccountDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';

/** Spec 8.13: el usuario indica el saldo real y se registra la diferencia como "Ajuste de saldo". */
export function AdjustBalanceSheet({
  account,
  onClose,
}: {
  account: AccountDTO | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={account !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Ajustar saldo"
      description='Registramos la diferencia como "Ajuste de saldo"; después puedes editarlo o eliminarlo.'
    >
      {account && <AdjustForm account={account} onDone={onClose} />}
    </Sheet>
  );
}

function AdjustForm({ account, onDone }: { account: AccountDTO; onDone: () => void }) {
  const today = useToday();
  const [actual, setActual] = useState<number | null>(null);
  const [negative, setNegative] = useState(false);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const save = useCrudMutation(
    (body: { actualBalance: number; date: string }) =>
      api.post(`/accounts/${account.id}/adjust`, body),
    'Saldo ajustado',
  );
  const target = actual === null ? null : negative ? -actual : actual;
  const diff = target === null ? 0 : target - account.balance;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (target === null) return setError('Escribe el saldo real');
        save.mutate(
          { actualBalance: target, date },
          {
            onSuccess: onDone,
            onError: (err) => setError(err.fields?.actualBalance ?? err.message),
          },
        );
      }}
    >
      <p className="text-sm text-muted">
        Saldo en la app ({account.name}):{' '}
        <Amount value={account.balance} tone="balance" className="font-medium text-fg" />
      </p>
      <Field label="Saldo real hoy" htmlFor="adj-actual">
        <MoneyInput id="adj-actual" value={actual} onChange={setActual} />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={negative}
          onChange={(e) => setNegative(e.target.checked)}
        />
        Saldo negativo (sobregiro)
      </label>
      {diff !== 0 && (
        <p className="text-sm">
          Se registrará {diff > 0 ? 'un ingreso' : 'un gasto'} de{' '}
          <Amount value={Math.abs(diff)} className="font-semibold" />.
        </p>
      )}
      <DateChips value={date} onChange={setDate} today={today} />
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar ajuste
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Página de cuentas**

Reemplazar el componente `AccountsPage` de `apps/web/src/features/accounts/AccountsPage.tsx` (y sus imports) por:

```tsx
import { ACCOUNT_TYPE_LABELS, isLiquidAccount, type AccountDTO } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { DeletedSection } from '../../components/ui/DeletedSection';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { Icon } from '../../lib/icons';
import { useAccounts } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { AccountFormSheet } from './AccountFormSheet';
import { AdjustBalanceSheet } from './AdjustBalanceSheet';
```

(`AccountList` queda igual) y:

```tsx
export function AccountsPage() {
  const accounts = useAccounts();
  const toast = useToast();
  const [editing, setEditing] = useState<AccountDTO | undefined>();
  const [open, setOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<AccountDTO | null>(null);
  const restore = useCrudMutation(
    (id: string) => api.post(`/accounts/${id}/restore`),
    'Cuenta restaurada',
  );
  const openForm = (a?: AccountDTO) => {
    setEditing(a);
    setOpen(true);
  };

  if (accounts.isPending) return <PageSpinner />;
  if (accounts.isError)
    return <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;
  const active = accounts.data.filter((a) => a.isActive);
  const total = accounts.data.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mis cuentas</h1>
        <Button size="sm" onClick={() => openForm()} aria-label="Nueva cuenta">
          <Plus size={16} /> Nueva
        </Button>
      </div>
      {accounts.data.length === 0 ? (
        <EmptyState
          title="Aún no tienes cuentas"
          description="Agrega efectivo, bancos, billeteras como Nequi o Daviplata, y tus cuentas de ahorro."
        />
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl bg-surface p-4 ring-1 ring-border">
            <span className="font-medium">Dinero total</span>
            <Amount value={total} tone="balance" className="text-lg font-semibold" />
          </div>
          <AccountList
            title="Disponibles"
            accounts={active.filter((a) => isLiquidAccount(a.type))}
            onSelect={openForm}
          />
          <AccountList
            title="Ahorro e inversión"
            accounts={active.filter((a) => !isLiquidAccount(a.type))}
            onSelect={openForm}
          />
          <DeletedSection
            items={accounts.data.filter((a) => !a.isActive)}
            restoringId={restore.isPending ? (restore.variables ?? null) : null}
            onRestore={(a) =>
              restore.mutate(a.id, {
                onError: (err) => toast.show({ message: err.message, tone: 'error' }),
              })
            }
          />
        </>
      )}
      <AccountFormSheet
        open={open}
        onOpenChange={setOpen}
        account={editing}
        onAdjust={(a) => {
          setOpen(false);
          setAdjusting(a);
        }}
      />
      <AdjustBalanceSheet account={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}
```

- [ ] **Step 7: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web -- src/features/accounts && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): eliminar y restaurar cuentas, sobregiro y ajuste de saldo"
```

---

### Task 4: Tarjetas, préstamos, categorías y etiquetas — eliminar, restaurar y editar

**Files:**
- Modify: `apps/web/src/features/cards/CardsPage.tsx`, `CardFormSheet.tsx`, `CardDetailPage.tsx`
- Modify: `apps/web/src/features/debts/DebtsPage.tsx`, `DebtFormSheet.tsx`
- Modify: `apps/web/src/features/categories/CategoriesPage.tsx`, `CategoryFormSheet.tsx`
- Create: `apps/web/src/features/categories/TagsList.tsx`
- Create: `apps/web/src/features/cards/CardsPage.test.tsx`, `apps/web/src/features/categories/CategoriesPage.test.tsx`

**Interfaces:**
- Consumes: `DELETE`/`POST …/restore` de tarjetas, préstamos y categorías; `PUT /api/tags/:id { name }` y `DELETE /api/tags/:id` (plan 2A, Tasks 8 y 15); `DeletedSection`.
- Produces: pantallas sin "Archivar"; "Saldo a favor" en tarjetas con deuda negativa; categorías del sistema visibles y editables (sin cambiar de principal); pestaña "Etiquetas" con renombrar y eliminar (`TagsList`).

- [ ] **Step 1: Escribir los tests**

Create `apps/web/src/features/cards/CardsPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { CardsPage } from './CardsPage';

afterEach(() => vi.unstubAllGlobals());

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
  debt: -50_000,
  available: 5_050_000,
  utilization: 0,
  amountDue: 0,
  dueDate: '2026-10-30',
  isOverdue: false,
  lastCutoff: '2026-10-15',
  nextCutoff: '2026-11-15',
  nextDueDate: '2026-11-30',
  committed: 0,
};

describe('CardsPage', () => {
  it('shows an overpaid card as balance in favor and restores deleted cards', async () => {
    const restored: string[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /credit-cards': () => ({
        status: 200,
        body: { items: [card, { ...card, id: 'c2', name: 'Vieja', isActive: false, debt: 0 }] },
      }),
      'POST /credit-cards/c2/restore': () => {
        restored.push('c2');
        return { status: 200, body: { card } };
      },
    });
    renderWithProviders(<CardsPage />);
    expect(await screen.findByText('Saldo a favor')).toBeInTheDocument();
    expect(screen.getByText('$50.000')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Vieja' }));
    await waitFor(() => expect(restored).toEqual(['c2']));
  });
});
```

Create `apps/web/src/features/categories/CategoriesPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { CategoriesPage } from './CategoriesPage';

afterEach(() => vi.unstubAllGlobals());

const cat = (over: Record<string, unknown>) => ({
  id: 'k1',
  name: 'Alimentación',
  kind: 'EXPENSE',
  parentId: null,
  bucket: 'OBLIGATIONS',
  icon: 'utensils',
  color: '#f97316',
  isSystem: false,
  systemKey: null,
  isActive: true,
  sortOrder: 1,
  ...over,
});

describe('CategoriesPage', () => {
  it('lists system categories, folds deleted ones and restores them', async () => {
    const restored: string[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /categories': () => ({
        status: 200,
        body: {
          items: [
            cat({}),
            cat({ id: 'k2', name: 'Ajuste de saldo', isSystem: true, systemKey: 'ADJUSTMENT_EXPENSE', bucket: 'OTHER' }),
            cat({ id: 'k3', name: 'Mascotas', isActive: false, bucket: 'OTHER' }),
          ],
        },
      }),
      'POST /categories/k3/restore': () => {
        restored.push('k3');
        return { status: 200, body: { category: cat({ id: 'k3', name: 'Mascotas' }) } };
      },
    });
    renderWithProviders(<CategoriesPage />);
    expect(await screen.findByText('Ajuste de saldo')).toBeInTheDocument();
    expect(screen.getByText('Del sistema')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Mascotas' }));
    await waitFor(() => expect(restored).toEqual(['k3']));
  });

  it('renames a tag from the Etiquetas tab', async () => {
    const renamed: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /categories': () => ({ status: 200, body: { items: [cat({})] } }),
      'GET /tags': () => ({ status: 200, body: { items: [{ id: 't1', name: 'viaje', usageCount: 3 }] } }),
      'PUT /tags/t1': (body) => {
        renamed.push(body);
        return { status: 200, body: { tag: { id: 't1', name: 'vacaciones', usageCount: 3 } } };
      },
    });
    renderWithProviders(<CategoriesPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Etiquetas' }));
    await userEvent.click(await screen.findByRole('button', { name: /#viaje/ }));
    const input = screen.getByLabelText('Nombre de la etiqueta');
    await userEvent.clear(input);
    await userEvent.type(input, 'Vacaciones');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar etiqueta' }));
    await waitFor(() => expect(renamed).toEqual([{ name: 'Vacaciones' }]));
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/features/cards src/features/categories`
Expected: FAIL.

- [ ] **Step 3: Tarjetas**

En `apps/web/src/features/cards/CardsPage.tsx`:

1. Imports adicionales: `DeletedSection`, `useToast`, `api`, `useCrudMutation`.
2. Dentro de `CardsPage`, debajo de `const [open, setOpen] = useState(false);`:

```tsx
  const toast = useToast();
  const restore = useCrudMutation(
    (id: string) => api.post(`/credit-cards/${id}/restore`),
    'Tarjeta restaurada',
  );
```

3. Iterar solo las activas (`cards.data.filter((c) => c.isActive).map(…)`), quitar el `{!c.isActive && …(archivada)…}` y reemplazar el bloque de la derecha (`<span className="text-right">…</span>`) por:

```tsx
                <span className="text-right">
                  {c.debt < 0 ? (
                    <>
                      <span className="block text-xs text-positive">Saldo a favor</span>
                      <Amount value={-c.debt} className="block font-semibold" />
                    </>
                  ) : (
                    <>
                      <Amount
                        value={c.debt}
                        tone={c.debt > 0 ? 'debt' : 'neutral'}
                        className="block font-semibold"
                      />
                      <span className="text-xs text-muted">
                        de <Amount value={c.creditLimit} />
                      </span>
                    </>
                  )}
                </span>
```

4. Después de la lista (`</ul>`), dentro del mismo fragmento del `else`, agregar:

```tsx
          <DeletedSection
            items={cards.data.filter((c) => !c.isActive)}
            restoringId={restore.isPending ? (restore.variables ?? null) : null}
            onRestore={(c) =>
              restore.mutate(c.id, {
                onError: (err) => toast.show({ message: err.message, tone: 'error' }),
              })
            }
          />
```

(envolver la `<ul>` y el `DeletedSection` en `<>…</>`).

En `apps/web/src/features/cards/CardFormSheet.tsx`: borrar la mutación `archive`, cambiar `remove` a `api.del<DeleteResultDTO>(…)` (importar `type DeleteResultDTO`) y reemplazar el bloque final `{card && (<div className="grid grid-cols-2 gap-2">…</div>)}` por:

```tsx
      {card && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
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
            Eliminar tarjeta
          </ConfirmButton>
          <p className="text-xs text-muted">
            Para eliminarla debe tener deuda $0. Si tiene movimientos, se oculta y su historial se
            conserva.
          </p>
        </div>
      )}
```

En `apps/web/src/features/cards/CardDetailPage.tsx`:

1. Imports adicionales: `useCrudMutation` (`../../lib/useCrud`).
2. Debajo de `const [selected, …]`:

```tsx
  const restore = useCrudMutation(
    () => api.post(`/credit-cards/${id}/restore`),
    'Tarjeta restaurada',
  );
```

3. El botón "Editar" solo se muestra si `card.isActive`; y justo después del encabezado (`</div>` del título) agregar:

```tsx
      {!card.isActive && (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Esta tarjeta fue eliminada. Su historial se conserva.</p>
          <Button size="sm" loading={restore.isPending} onClick={() => restore.mutate()}>
            Restaurar
          </Button>
        </Card>
      )}
```

4. En el `dl`, reemplazar el bloque "Deuda" por:

```tsx
          <div>
            <dt className="text-muted">{card.debt < 0 ? 'Saldo a favor' : 'Deuda'}</dt>
            <dd className="font-semibold">
              <Amount value={Math.abs(card.debt)} tone={card.debt > 0 ? 'debt' : 'neutral'} />
            </dd>
          </div>
```

- [ ] **Step 4: Préstamos**

En `apps/web/src/features/debts/DebtsPage.tsx`: importar `DeletedSection`, `useToast`, `api` y `useCrudMutation`; agregar

```tsx
  const toast = useToast();
  const restore = useCrudMutation(
    (id: string) => api.post(`/debts/${id}/restore`),
    'Préstamo restaurado',
  );
```

iterar solo `debts.data.filter((d) => d.isActive)`, quitar `{!d.isActive && …(archivado)…}` y, después de la `<ul>`, agregar (envolviendo ambos en `<>…</>`):

```tsx
          <DeletedSection
            items={debts.data.filter((d) => !d.isActive)}
            restoringId={restore.isPending ? (restore.variables ?? null) : null}
            onRestore={(d) =>
              restore.mutate(d.id, {
                onError: (err) => toast.show({ message: err.message, tone: 'error' }),
              })
            }
          />
```

En `apps/web/src/features/debts/DebtFormSheet.tsx`: borrar `archive`; `remove` con `api.del<DeleteResultDTO>(…)`; reemplazar el bloque final de botones por:

```tsx
      {debt && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar préstamo
          </ConfirmButton>
          <p className="text-xs text-muted">
            Para eliminarlo debe tener saldo $0. Si tiene movimientos, se oculta y su historial se
            conserva.
          </p>
        </div>
      )}
```

- [ ] **Step 5: Etiquetas**

Create `apps/web/src/features/categories/TagsList.tsx`:

```tsx
import type { TagDTO } from '@finanzas/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { Field, TextInput } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';

export function TagsList() {
  const tags = useQuery({
    queryKey: qk.tags,
    queryFn: () => api.get<{ items: TagDTO[] }>('/tags').then((r) => r.items),
  });
  const [editing, setEditing] = useState<TagDTO | null>(null);
  if (tags.isPending) return <PageSpinner />;
  if (tags.isError) return <ErrorState error={tags.error} onRetry={() => void tags.refetch()} />;
  if (tags.data.length === 0)
    return (
      <EmptyState
        title="Aún no usas etiquetas"
        description="Agrégalas al registrar un movimiento, en Más opciones."
      />
    );
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
        {tags.data.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setEditing(t)}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left"
            >
              <span className="font-medium">#{t.name}</span>
              <span className="text-xs text-muted">
                {t.usageCount === 1 ? '1 movimiento' : `${t.usageCount} movimientos`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar etiqueta"
      >
        {editing && <TagForm tag={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function TagForm({ tag, onDone }: { tag: TagDTO; onDone: () => void }) {
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const save = useCrudMutation(
    (body: { name: string }) => api.put(`/tags/${tag.id}`, body),
    'Etiqueta actualizada',
  );
  const remove = useCrudMutation(() => api.del(`/tags/${tag.id}`), 'Etiqueta eliminada');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError('Escribe un nombre');
        save.mutate({ name }, { onSuccess: onDone, onError: (err) => setError(err.message) });
      }}
    >
      <Field label="Nombre de la etiqueta" htmlFor="tag-name" error={error ?? undefined}>
        <TextInput id="tag-name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar etiqueta
      </Button>
      <ConfirmButton
        size="lg"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onDone })}
      >
        Eliminar etiqueta
      </ConfirmButton>
      <p className="text-xs text-muted">Al eliminarla se quita de los movimientos que la usan.</p>
    </form>
  );
}
```

- [ ] **Step 6: Categorías**

Reemplazar el contenido de `apps/web/src/features/categories/CategoriesPage.tsx` por:

```tsx
import { BUCKET_LABELS, type CategoryDTO, type CategoryKind } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { DeletedSection } from '../../components/ui/DeletedSection';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Icon } from '../../lib/icons';
import { useCategories } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { CategoryFormSheet } from './CategoryFormSheet';
import { TagsList } from './TagsList';

type Tab = CategoryKind | 'TAGS';

export function CategoriesPage() {
  const categories = useCategories();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('EXPENSE');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDTO | undefined>();
  const restore = useCrudMutation(
    (id: string) => api.post(`/categories/${id}/restore`),
    'Categoría restaurada',
  );
  if (categories.isPending) return <PageSpinner />;
  if (categories.isError)
    return <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />;

  const kind: CategoryKind = tab === 'INCOME' ? 'INCOME' : 'EXPENSE';
  const ofKind = categories.data.filter((c) => c.kind === kind);
  const visible = ofKind.filter((c) => c.isActive);
  const roots = visible.filter((c) => !c.parentId);
  const edit = (c?: CategoryDTO) => {
    setEditing(c);
    setOpen(true);
  };
  const row = (c: CategoryDTO, child = false) => (
    <li key={c.id}>
      <button
        type="button"
        onClick={() => edit(c)}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left',
          child && 'pl-12',
        )}
      >
        <span
          className="flex size-8 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: c.color }}
        >
          <Icon name={c.icon} size={16} />
        </span>
        <span className="flex-1">
          <span className="block">{c.name}</span>
          {c.systemKey ? (
            <span className="block text-xs text-muted">Del sistema</span>
          ) : (
            !child &&
            c.bucket && <span className="block text-xs text-muted">{BUCKET_LABELS[c.bucket]}</span>
          )}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categorías</h1>
        {tab !== 'TAGS' && (
          <Button size="sm" onClick={() => edit()} aria-label="Nueva categoría">
            <Plus size={16} /> Nueva
          </Button>
        )}
      </div>
      <Chips
        ariaLabel="Qué ver"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'EXPENSE', label: 'Gastos' },
          { value: 'INCOME', label: 'Ingresos' },
          { value: 'TAGS', label: 'Etiquetas' },
        ]}
      />
      {tab === 'TAGS' ? (
        <TagsList />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {roots.flatMap((root) => [
              row(root),
              ...visible.filter((c) => c.parentId === root.id).map((c) => row(c, true)),
            ])}
          </ul>
          <DeletedSection
            items={ofKind.filter((c) => !c.isActive)}
            restoringId={restore.isPending ? (restore.variables ?? null) : null}
            onRestore={(c) =>
              restore.mutate(c.id, {
                onError: (err) => toast.show({ message: err.message, tone: 'error' }),
              })
            }
          />
          <p className="px-1 text-xs text-muted">
            Ahorrar no es un gasto: para ahorrar, transfiere a una cuenta de ahorro. Pagar una
            tarjeta o un préstamo tampoco es un gasto; solo los intereses lo son.
          </p>
        </>
      )}
      <CategoryFormSheet open={open} onOpenChange={setOpen} kind={kind} category={editing} />
    </div>
  );
}
```

En `apps/web/src/features/categories/CategoryFormSheet.tsx`:

1. `parents` solo con categorías activas: `(c) => c.kind === kind && !c.parentId && !c.isSystem && c.isActive && c.id !== category?.id`.
2. Borrar la mutación `archive`; `remove` con `api.del<DeleteResultDTO>(…)` (importar el tipo).
3. En el `Select` de categoría principal agregar `disabled={!!category?.systemKey}` y cambiar el `hint` del `Field` a:

```tsx
        hint={
          category?.systemKey
            ? 'Las categorías del sistema no pueden ser subcategorías.'
            : 'Déjala vacía para crear una categoría principal.'
        }
```

4. Reemplazar el bloque final de botones por:

```tsx
      {category && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar categoría
          </ConfirmButton>
          <p className="text-xs text-muted">
            Se elimina con sus subcategorías. Los movimientos la conservan en el historial; si la
            app la necesita, la restaura sola.
          </p>
        </div>
      )}
```

- [ ] **Step 7: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): eliminar y restaurar tarjetas, préstamos y categorías; etiquetas editables"
```

---

### Task 5: Movimientos — "(eliminada)", gasto ⇄ tarjeta, movimientos congelados, desembolso, historial

**Files:**
- Create: `apps/web/src/lib/refs.ts`
- Modify: `apps/web/src/features/transactions/describe.ts`, `TransactionDetailSheet.tsx`, `TransactionsPage.tsx`, `FiltersSheet.tsx`
- Modify: `apps/web/src/features/quick-add/TransactionForm.tsx`, `QuickAddContext.tsx`, `QuickAddSheets.tsx`
- Modify: `apps/web/src/features/debts/DisbursementSheet.tsx`
- Modify (tests): `TransactionRow.test.tsx`, `TransactionDetailSheet.test.tsx`, `QuickAddSheets.test.ts`, `TransactionForm.test.tsx`
- Create: `apps/web/src/features/transactions/FiltersSheet.test.tsx`

**Interfaces:**
- Consumes: `RefDTO.isActive` (plan 2A Task 1); `PUT /api/transactions/:id` con cambio `EXPENSE` ⇄ `CARD_PURCHASE` y 409 `ENTITY_DELETED` (plan 2A Tasks 8 y 9).
- Produces:
  - `refName(ref: { name: string; isActive?: boolean } | null | undefined, deleted?: string): string | null` en `lib/refs.ts` (agrega "(eliminada)").
  - `QuickAddKind` incluye `'disbursement'`; `kindForTransaction` devuelve `'disbursement'` para `DEBT_DISBURSEMENT`.
  - `DisbursementForm({ debtId, edit?, onDone })` exportado desde `DisbursementSheet.tsx`.
  - `TransactionForm` en edición ofrece cuentas y tarjetas (cambia el tipo) y bloquea valor, fecha y medio de pago si la cuenta o tarjeta fue eliminada.

- [ ] **Step 1: Escribir los tests**

En `apps/web/src/features/transactions/TransactionRow.test.tsx`, agregar:

```tsx
  it('marks a deleted account in the subtitle', () => {
    render(
      <TransactionRow
        transaction={{
          ...base,
          type: 'EXPENSE',
          account: { ...ref('a1', 'Nequi'), isActive: false, type: 'DIGITAL_WALLET' },
          category: { ...ref('k1', 'Mercado'), kind: 'EXPENSE', parentId: null },
          description: 'Compra',
        }}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText(/Nequi \(eliminada\)/)).toBeInTheDocument();
  });
```

(`base` y `ref` ya existen en ese archivo; `ref` incluye `isActive: true` desde la Task 1 del plan 2A).

En `apps/web/src/features/transactions/TransactionDetailSheet.test.tsx`, reemplazar el test existente por:

```tsx
  it('offers edit and delete for a loan disbursement', () => {
    renderWithProviders(
      <QuickAddProvider>
        <TransactionDetailSheet transaction={disbursement} onClose={() => undefined} />
      </QuickAddProvider>,
    );
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });
```

En `apps/web/src/features/quick-add/QuickAddSheets.test.ts`, cambiar la última expectativa por:

```ts
    expect(kindForTransaction(tx('DEBT_DISBURSEMENT'))).toBe('disbursement');
```

(y el nombre del test a `'maps every editable type to its form'`).

En `apps/web/src/features/quick-add/TransactionForm.test.tsx`, reemplazar `'refuses to edit unsupported movement types'` y agregar dos tests en `describe('TransactionForm (edit and errors)', …)`:

```tsx
  it('refuses to edit movement types it does not handle', async () => {
    setup();
    const edit = {
      id: 't1',
      type: 'TRANSFER',
      amount: 1,
      date: '2026-10-05',
      tags: [],
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    expect(
      await screen.findByText('Este movimiento no se puede editar desde aquí.'),
    ).toBeInTheDocument();
  });

  it('switches an expense to a card purchase when a card is chosen (addendum §4)', async () => {
    const puts: Record<string, unknown>[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: accounts } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
      'PUT /transactions/t9': (body) => {
        puts.push(body as Record<string, unknown>);
        return { status: 200, body: { transaction: { id: 't9' }, warnings: [] } };
      },
    });
    const edit = {
      id: 't9',
      type: 'EXPENSE',
      amount: 8000,
      date: '2026-10-05',
      description: null,
      payee: null,
      notes: null,
      tags: [],
      installments: null,
      paymentMethod: null,
      account: { id: 'a1', name: 'Nequi', isActive: true },
      creditCard: null,
      category: { id: 'k1', name: 'Alimentación', isActive: true },
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('radio', { name: /Nu Crédito/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ type: 'CARD_PURCHASE', creditCardId: 'c1', installments: 1 });
    expect(puts[0]).not.toHaveProperty('accountId');
  });

  it('locks money fields of a movement whose account was deleted (review focus #5)', async () => {
    const puts: Record<string, unknown>[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [{ ...accounts[0], isActive: false }] } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: cards } }),
      'GET /categories': () => ({ status: 200, body: { items: categories } }),
      'PUT /transactions/t9': (body) => {
        puts.push(body as Record<string, unknown>);
        return { status: 200, body: { transaction: { id: 't9' }, warnings: [] } };
      },
    });
    const edit = {
      id: 't9',
      type: 'EXPENSE',
      amount: 8000,
      date: '2026-10-05',
      description: null,
      payee: null,
      notes: null,
      tags: [],
      installments: null,
      paymentMethod: null,
      account: { id: 'a1', name: 'Nequi', isActive: false },
      creditCard: null,
      category: { id: 'k1', name: 'Alimentación', isActive: true },
    } as unknown as TransactionDTO;
    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    expect(await screen.findByLabelText('Valor')).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('"Nequi" fue eliminada');
    expect(screen.queryByRole('radio', { name: /Nu Crédito/ })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Descripción (opcional)'), 'Mercado');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ amount: 8000, date: '2026-10-05', accountId: 'a1', description: 'Mercado' });
  });
```

Create `apps/web/src/features/transactions/FiltersSheet.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { FiltersSheet } from './FiltersSheet';
import { EMPTY_FILTERS } from './filters';

afterEach(() => vi.unstubAllGlobals());

describe('FiltersSheet', () => {
  it('does not apply a custom range whose end is before its start', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [] } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: [] } }),
      'GET /categories': () => ({ status: 200, body: { items: [] } }),
      'GET /tags': () => ({ status: 200, body: { items: [] } }),
    });
    const onApply = vi.fn();
    renderWithProviders(
      <FiltersSheet open onOpenChange={() => undefined} value={EMPTY_FILTERS} onApply={onApply} />,
    );
    await userEvent.click(await screen.findByRole('radio', { name: 'Personalizado' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha final debe ser igual o posterior a la inicial');
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/features/transactions src/features/quick-add`
Expected: FAIL.

- [ ] **Step 3: Nombres con "(eliminada)"**

Create `apps/web/src/lib/refs.ts`:

```ts
/** Addendum §3.1: lo eliminado se sigue viendo en el historial, marcado. */
export function refName(
  ref: { name: string; isActive?: boolean } | null | undefined,
  deleted = '(eliminada)',
): string | null {
  if (!ref) return null;
  return ref.isActive === false ? `${ref.name} ${deleted}` : ref.name;
}
```

En `apps/web/src/features/transactions/describe.ts`, importar `refName` y usarlo en lugar de `.name` para cuentas, tarjetas, préstamos y categorías:

```ts
export function describeTransaction(t: TransactionDTO): Described {
  const category = refName(t.category);
  const account = refName(t.account);
  const toAccount = refName(t.toAccount);
  const card = refName(t.creditCard);
  const debt = refName(t.debt, '(eliminado)');
  const typeLabel = TRANSACTION_TYPE_LABELS[t.type];
```

y en cada `case` reemplazar `t.account?.name` por `account`, `t.toAccount?.name` por `toAccount`, `t.creditCard?.name` por `card` y `t.debt?.name` por `debt` (los `?? '?'` se mantienen).

En `apps/web/src/features/transactions/TransactionDetailSheet.tsx`, importar `refName` y cambiar las filas:

```tsx
    ['Categoría', refName(transaction.category)],
    ['Cuenta', refName(transaction.account)],
    ['Cuenta destino', refName(transaction.toAccount)],
    ['Tarjeta', refName(transaction.creditCard)],
    ['Préstamo', refName(transaction.debt, '(eliminado)')],
```

- [ ] **Step 4: Desembolso editable**

En `apps/web/src/features/quick-add/QuickAddContext.tsx`, agregar `'disbursement'` al tipo `QuickAddKind`:

```ts
export type QuickAddKind =
  | 'menu'
  | 'expense'
  | 'income'
  | 'transfer'
  | 'card-purchase'
  | 'card-payment'
  | 'loan-payment'
  | 'disbursement';
```

Reemplazar `apps/web/src/features/debts/DisbursementSheet.tsx` por:

```tsx
import type { DebtDTO, TransactionDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { useAccounts } from '../../lib/queries';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';
import { useSaveTransaction } from '../quick-add/useSaveTransaction';

export function DisbursementSheet({
  debt,
  onClose,
}: {
  debt: DebtDTO | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={debt !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Registrar desembolso"
      description="Dinero adicional del préstamo que entra a tu cuenta. No es un ingreso."
    >
      {debt && <DisbursementForm debtId={debt.id} onDone={onClose} />}
    </Sheet>
  );
}

/** Crear (desde Préstamos) o editar (desde el historial) un desembolso. */
export function DisbursementForm({
  debtId,
  edit,
  onDone,
}: {
  debtId: string;
  edit?: TransactionDTO;
  onDone: () => void;
}) {
  const today = useToday();
  const accounts = useAccounts();
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [accountId, setAccountId] = useState(edit?.account?.id ?? '');
  const [date, setDate] = useState(edit?.date ?? today);
  const [description, setDescription] = useState(edit?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useSaveTransaction(edit ? 'Desembolso actualizado' : 'Desembolso registrado');
  const options = (accounts.data ?? []).filter((a) => a.isActive || a.id === edit?.account?.id);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!amount || !accountId) return setError('Escribe el valor y elige la cuenta');
        const body = { amount, accountId, date, description: description || null };
        save.submit(
          edit
            ? {
                path: `/transactions/${edit.id}`,
                method: 'PUT',
                body: {
                  type: 'DEBT_DISBURSEMENT',
                  ...body,
                  debtId,
                  payee: edit.payee,
                  notes: edit.notes,
                  tags: edit.tags,
                },
              }
            : { path: `/debts/${debtId}/disbursements`, method: 'POST', body },
          { onSuccess: onDone, onError: (err) => setError(err.message) },
        );
      }}
    >
      <Field label="Valor" htmlFor="disb-amount">
        <MoneyInput id="disb-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field label="Recibido en" htmlFor="disb-account">
        <Select id="disb-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <DateChips value={date} onChange={setDate} today={today} />
      <Field label="Descripción (opcional)" htmlFor="disb-description">
        <TextInput
          id="disb-description"
          maxLength={140}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar
      </Button>
    </form>
  );
}
```

En `apps/web/src/features/quick-add/QuickAddSheets.tsx`:

1. Importar `DisbursementForm` (`../debts/DisbursementSheet`).
2. Agregar a `TITLES`: `disbursement: 'Desembolso de préstamo',`.
3. En `kindForTransaction`, reemplazar `default: return null;` por:

```ts
    case 'DEBT_DISBURSEMENT':
      return 'disbursement';
```

(y cambiar el tipo de retorno a `QuickAddKind`; ya no devuelve null).

4. Dentro del `Sheet`, al final:

```tsx
      {kind === 'disbursement' && edit && (
        <DisbursementForm debtId={edit.debt?.id ?? ''} edit={edit} onDone={close} />
      )}
```

En `TransactionDetailSheet.tsx`, `editKind` ahora siempre tiene valor: simplificar a `const editKind = kindForTransaction(transaction);` y el bloque de botones a `<div className="mt-4 grid grid-cols-2 gap-2">` con ambos botones.

- [ ] **Step 5: Edición del formulario de gasto e ingreso**

En `apps/web/src/features/quick-add/TransactionForm.tsx`:

1. Borrar el comentario y el filtro por tipo en edición; `sources` queda:

```ts
  // Al editar, elegir una tarjeta convierte el gasto en compra con tarjeta y viceversa (addendum §4).
  const sources = allSources;
```

2. Debajo de `const kind = …`:

```ts
  // Movimiento de una cuenta o tarjeta eliminada: su dinero queda congelado (addendum §3.1).
  const frozen = edit ? ([edit.account, edit.creditCard].find((r) => r?.isActive === false) ?? null) : null;
```

3. En el `MoneyInput` del valor: `autoFocus={!edit}` y `disabled={!!frozen}`.

4. Antes del bloque del valor (al inicio del `<form>`), agregar:

```tsx
      {frozen && (
        <p role="note" className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
          "{frozen.name}" fue eliminada: solo puedes cambiar la categoría, la descripción, las
          etiquetas y las notas. Restáurala para cambiar el valor, la fecha o el medio de pago.
        </p>
      )}
```

5. Reemplazar el bloque "Pagado con / Recibido en" por:

```tsx
      <div className="space-y-2">
        <p className="text-sm font-medium">{mode === 'income' ? 'Recibido en' : 'Pagado con'}</p>
        {frozen ? (
          <p className="text-sm">{frozen.name} (eliminada)</p>
        ) : (
          <Chips
            ariaLabel={mode === 'income' ? 'Cuenta' : 'Medio de pago'}
            value={source ? sourceKey(source) : null}
            onChange={(key) =>
              setChosenSource(sources.find((s) => sourceKey(s.source) === key)?.source ?? null)
            }
            options={sources.map((s) => ({
              value: sourceKey(s.source),
              label: s.label,
              icon: <Icon name={s.icon} size={16} />,
            }))}
          />
        )}
        {errors.source && <p className="text-sm text-negative">{errors.source}</p>}
        {errors.accountId && <p className="text-sm text-negative">{errors.accountId}</p>}
        {errors.creditCardId && <p className="text-sm text-negative">{errors.creditCardId}</p>}
      </div>
```

6. En el campo "Cuotas", agregar `disabled={!!frozen}` al `TextInput`.

7. Reemplazar el bloque de la fecha por:

```tsx
      <div className="space-y-2">
        <p className="text-sm font-medium">Fecha</p>
        {frozen ? (
          <p className="text-sm">{formatDate(date)}</p>
        ) : (
          <DateChips value={date} onChange={setDate} today={today} />
        )}
        {errors.date && <p className="text-sm text-negative">{errors.date}</p>}
      </div>
```

(importar `formatDate` de `../../lib/format`).

8. Cambiar la guarda de tipos editables a:

```ts
  if (edit && edit.type !== 'EXPENSE' && edit.type !== 'CARD_PURCHASE' && edit.type !== 'INCOME') {
    return <EmptyState title="Este movimiento no se puede editar desde aquí." />;
  }
```

(ya existe: no cambia; el test nuevo usa `TRANSFER`).

- [ ] **Step 6: Historial sin parpadeo y rango válido**

En `apps/web/src/features/transactions/TransactionsPage.tsx`, importar `keepPreviousData` de `@tanstack/react-query` y agregar al `useInfiniteQuery`:

```ts
    placeholderData: keepPreviousData,
```

En `apps/web/src/features/transactions/FiltersSheet.tsx`, dentro de `FiltersForm` (debajo de `toggleType`):

```ts
  const invalidRange =
    draft.period === 'custom' && !!draft.from && !!draft.to && draft.from > draft.to;
```

debajo del `grid` de las dos fechas personalizadas (dentro del `{draft.period === 'custom' && (…)}`, envolviendo en `<>…</>`):

```tsx
            {invalidRange && (
              <p role="alert" className="text-sm text-negative">
                La fecha final debe ser igual o posterior a la inicial.
              </p>
            )}
```

y en el botón "Aplicar": `<Button disabled={invalidRange} onClick={() => onApply(draft)}>Aplicar</Button>`.

- [ ] **Step 7: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): edición total de movimientos y referencias eliminadas en el historial"
```

---

### Task 6: Registro rápido — "Recurrente" y "¿Es el pago de X?"

**Files:**
- Create: `apps/web/src/features/quick-add/recurrence.ts`, `apps/web/src/features/quick-add/recurrence.test.ts`
- Modify: `apps/web/src/features/quick-add/TransactionForm.tsx`
- Modify: `apps/web/src/features/quick-add/TransactionForm.test.tsx`

**Interfaces:**
- Consumes: `POST /api/transactions` con `recurring` o `scheduledItemId`; `GET /api/scheduled/suggestions?kind&categoryId&amount&date` (plan 2A Task 11); `FREQUENCIES`, `FREQUENCY_LABELS`, `ScheduledItemDTO`.
- Produces:
  - `semimonthlyDays(date: IsoDate): { day1: number; day2: number }` — los dos días de la quincena que incluyen la fecha (31 = último día).
  - `recurrencePayload(frequency, date, intervalDays): RecurringOnCreate` (cuerpo del campo `recurring`).
  - `TransactionForm` (solo al registrar): casilla "Recurrente (se repite)" en "Más opciones" y, si no es recurrente, consulta de sugerencias antes de guardar con la pregunta "¿Es el pago de X?" (Sí, enlazar / No, es otro).

- [ ] **Step 1: Escribir los tests**

Create `apps/web/src/features/quick-add/recurrence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { recurrencePayload, semimonthlyDays } from './recurrence';

describe('semimonthlyDays (review focus #3)', () => {
  it('always includes the date of the movement', () => {
    expect(semimonthlyDays('2026-10-15')).toEqual({ day1: 15, day2: 31 });
    expect(semimonthlyDays('2026-10-05')).toEqual({ day1: 5, day2: 20 });
    expect(semimonthlyDays('2026-10-30')).toEqual({ day1: 15, day2: 30 });
    expect(semimonthlyDays('2026-10-31')).toEqual({ day1: 16, day2: 31 });
    expect(semimonthlyDays('2026-02-28')).toEqual({ day1: 13, day2: 31 });
    expect(semimonthlyDays('2026-11-30')).toEqual({ day1: 15, day2: 31 });
  });
});

describe('recurrencePayload', () => {
  it('sends only what each frequency needs', () => {
    expect(recurrencePayload('MONTHLY', '2026-10-10', '30')).toEqual({ frequency: 'MONTHLY' });
    expect(recurrencePayload('CUSTOM_DAYS', '2026-10-10', '45')).toEqual({
      frequency: 'CUSTOM_DAYS',
      intervalDays: 45,
    });
    expect(recurrencePayload('SEMIMONTHLY', '2026-10-30', '30')).toEqual({
      frequency: 'SEMIMONTHLY',
      day1: 15,
      day2: 30,
    });
  });
});
```

En `apps/web/src/features/quick-add/TransactionForm.test.tsx`:

1. Cambiar la firma de `setup` para aceptar rutas extra:

```ts
function setup(slowSave = false, extra: Parameters<typeof mockApi>[0] = {}) {
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
    ...extra,
  });
}
```

2. Agregar al final:

```tsx
describe('TransactionForm (recurring and links, spec 8.11)', () => {
  const pending = {
    id: 's1',
    kind: 'EXPENSE',
    name: 'Arriendo',
    amount: 1_000_000,
    dueDate: '2026-10-05',
    ruleDate: '2026-10-05',
    status: 'PENDING',
    category: null,
    account: null,
    creditCard: null,
    recurringRuleId: 'r1',
    transactionId: null,
    derived: null,
    sourceId: null,
  };
  const suggestions = (items: unknown[]) => ({
    'GET /scheduled/suggestions': () => ({ status: 200, body: { items } }),
  });

  async function fillExpense() {
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '1000000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
  }

  it('asks whether it is the payment of a pending obligation and links it', async () => {
    setup(false, suggestions([pending]));
    await fillExpense();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Arriendo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, enlazar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ type: 'EXPENSE', amount: 1_000_000, scheduledItemId: 's1' });
  });

  it('saves without linking when the user says it is another expense', async () => {
    setup(false, suggestions([pending]));
    await fillExpense();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'No, es otro' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).not.toHaveProperty('scheduledItemId');
  });

  it('marks an expense as recurring without asking for a link', async () => {
    const fetchMock = setup(false, suggestions([pending]));
    await fillExpense();
    await userEvent.click(screen.getByRole('button', { name: /Más opciones/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Recurrente (se repite)' }));
    expect(screen.getByLabelText('Frecuencia')).toHaveValue('MONTHLY');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ recurring: { frequency: 'MONTHLY' } });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/scheduled/suggestions'))).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/features/quick-add`
Expected: FAIL (módulo `recurrence` inexistente; el formulario no pregunta ni ofrece "Recurrente").

- [ ] **Step 3: Utilidades de recurrencia**

Create `apps/web/src/features/quick-add/recurrence.ts`:

```ts
import { dayOfMonth, daysInMonth, yearMonth, type Frequency, type IsoDate } from '@finanzas/shared';

/**
 * Plan 2A, decisión 4: en la quincena, la fecha del movimiento debe ser uno de sus dos días.
 * 31 significa "último día del mes".
 */
export function semimonthlyDays(date: IsoDate): { day1: number; day2: number } {
  const d = dayOfMonth(date);
  const { year, month } = yearMonth(date);
  if (d <= 15) return { day1: d, day2: d === 15 ? 31 : d + 15 };
  return { day1: d - 15, day2: d === daysInMonth(year, month) ? 31 : d };
}

export type RecurringOnCreate =
  | { frequency: Exclude<Frequency, 'SEMIMONTHLY' | 'CUSTOM_DAYS'> }
  | { frequency: 'CUSTOM_DAYS'; intervalDays: number }
  | { frequency: 'SEMIMONTHLY'; day1: number; day2: number };

export function recurrencePayload(
  frequency: Frequency,
  date: IsoDate,
  intervalDays: string,
): RecurringOnCreate {
  if (frequency === 'SEMIMONTHLY') return { frequency, ...semimonthlyDays(date) };
  if (frequency === 'CUSTOM_DAYS') return { frequency, intervalDays: Number(intervalDays) };
  return { frequency };
}
```

- [ ] **Step 4: Formulario con recurrente y sugerencia**

En `apps/web/src/features/quick-add/TransactionForm.tsx`:

1. Imports: agregar `FREQUENCIES`, `FREQUENCY_LABELS`, `formatCOP`, `type Frequency`, `type ScheduledItemDTO` a los de `@finanzas/shared`; `useRef` a los de `react`; `import { api } from '../../lib/api';`; `formatShortDate` al import de `../../lib/format`; e `import { recurrencePayload, semimonthlyDays } from './recurrence';`.

2. Fuera del componente:

```ts
/** Spec 8.11: ocurrencia pendiente de la misma categoría, ±20 % del valor y ±7 días. */
async function findSuggestion(
  kind: 'INCOME' | 'EXPENSE',
  categoryId: string,
  amount: number,
  date: string,
): Promise<ScheduledItemDTO | null> {
  const params = new URLSearchParams({ kind, categoryId, amount: String(amount), date });
  try {
    return (await api.get<{ items: ScheduledItemDTO[] }>(`/scheduled/suggestions?${params}`)).items[0] ?? null;
  } catch {
    return null; // sin sugerencia: se guarda normal
  }
}
```

3. Estados nuevos (debajo de `errors`):

```ts
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('MONTHLY');
  const [intervalDays, setIntervalDays] = useState('30');
  const [suggestion, setSuggestion] = useState<{
    item: ScheduledItemDTO;
    body: Record<string, unknown>;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
```

4. Reemplazar `submit` por `submit` + `send`:

```ts
  const send = (body: Record<string, unknown>, scheduledItemId: string | null) => {
    setSuggestion(null);
    save.submit(
      edit
        ? { path: `/transactions/${edit.id}`, method: 'PUT', body }
        : {
            path: '/transactions',
            method: 'POST',
            body: scheduledItemId ? { ...body, scheduledItemId } : body,
          },
      {
        onSuccess: () => {
          writeJSON(LAST_SOURCE, source);
          if (categoryId) {
            writeJSON(CATEGORY_USE, { ...usage, [categoryId]: (usage[categoryId] ?? 0) + 1 });
          }
          onDone();
        },
        onError: (err) =>
          setErrors(
            toFormErrors(err, [
              'amount',
              'categoryId',
              'source',
              'accountId',
              'creditCardId',
              'installments',
              'date',
              'interval',
            ]),
          ),
      },
    );
  };

  const submit = async () => {
    if (checkingRef.current) return;
    const next: Record<string, string> = {};
    if (!amount) next.amount = 'Escribe un valor mayor que $0';
    if (!categoryId) next.categoryId = 'Elige una categoría';
    if (!source)
      next.source =
        mode === 'income' ? 'Elige la cuenta donde lo recibiste' : 'Elige con qué pagaste';
    const n = Number(installments);
    if (isCard && (!Number.isInteger(n) || n < 1 || n > 48))
      next.installments = 'Entre 1 y 48 cuotas';
    const interval = Number(intervalDays);
    if (repeat && frequency === 'CUSTOM_DAYS' && !(Number.isInteger(interval) && interval >= 1 && interval <= 366))
      next.interval = 'Entre 1 y 366 días';
    setErrors(next);
    if (Object.keys(next).length > 0 || !source || !amount || !categoryId) return;

    const common = {
      amount,
      date,
      categoryId,
      description: description || null,
      notes: notes || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const body: Record<string, unknown> =
      mode === 'income'
        ? { type: 'INCOME', ...common, accountId: source.id, payee: payee || null }
        : isCard
          ? {
              type: 'CARD_PURCHASE',
              ...common,
              creditCardId: source.id,
              installments: n,
              ...(edit ? { payee: edit.payee } : {}),
            }
          : {
              type: 'EXPENSE',
              ...common,
              accountId: source.id,
              paymentMethod: paymentMethod || null,
              ...(edit ? { payee: edit.payee } : {}),
            };

    if (edit) return send(body, null);
    if (repeat) return send({ ...body, recurring: recurrencePayload(frequency, date, intervalDays) }, null);

    checkingRef.current = true;
    setChecking(true);
    const found = await findSuggestion(kind, categoryId, amount, date);
    checkingRef.current = false;
    setChecking(false);
    if (found) setSuggestion({ item: found, body });
    else send(body, null);
  };
```

(el `onSubmit` del `<form>` queda `void submit();`).

5. Dentro de `{showMore && (<div className="space-y-4">…)}`, al final, agregar (solo al registrar):

```tsx
          {!edit && (
            <div className="space-y-3 rounded-2xl border border-border p-3">
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                />
                Recurrente (se repite)
              </label>
              {repeat && (
                <>
                  <Field label="Frecuencia" htmlFor="frequency">
                    <Select
                      id="frequency"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as Frequency)}
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {FREQUENCY_LABELS[f]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {frequency === 'SEMIMONTHLY' && (
                    <p className="text-xs text-muted">
                      Los días {semimonthlyDays(date).day1} y{' '}
                      {semimonthlyDays(date).day2 === 31 ? 'último' : semimonthlyDays(date).day2}{' '}
                      de cada mes.
                    </p>
                  )}
                  {frequency === 'CUSTOM_DAYS' && (
                    <Field label="Cada cuántos días" htmlFor="interval" error={errors.interval}>
                      <TextInput
                        id="interval"
                        inputMode="numeric"
                        value={intervalDays}
                        onChange={(e) => setIntervalDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      />
                    </Field>
                  )}
                  <p className="text-xs text-muted">
                    Aparecerá en Recurrentes y obligaciones; las próximas veces solo tendrás que
                    confirmarlo.
                  </p>
                </>
              )}
            </div>
          )}
```

6. Reemplazar el bloque final del botón Guardar por:

```tsx
      <div className="sticky bottom-0 -mx-4 bg-surface px-4 pt-2 pb-1">
        {suggestion ? (
          <div role="group" aria-label="Sugerencia de enlace" className="space-y-2 rounded-2xl bg-surface-2 p-3">
            <p className="text-sm">
              {kind === 'INCOME' ? '¿Es el ingreso esperado ' : '¿Es el pago de '}
              <strong>{suggestion.item.name}</strong> ({formatCOP(suggestion.item.amount)},{' '}
              {formatShortDate(suggestion.item.dueDate)})?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => send(suggestion.body, suggestion.item.id)}>Sí, enlazar</Button>
              <Button variant="secondary" onClick={() => send(suggestion.body, null)}>
                No, es otro
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" size="lg" loading={save.isPending || checking}>
            Guardar
          </Button>
        )}
      </div>
```

- [ ] **Step 5: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web -- src/features/quick-add && npm run typecheck && npm run lint`
Expected: PASS (incluido el test del doble toque: el segundo toque se ignora mientras se consulta la sugerencia).

```bash
git add -A && git commit -m "feat(web): movimientos recurrentes y sugerencia de enlace al registrar"
```

---

### Task 7: Configuración financiera

**Files:**
- Create: `apps/web/src/features/settings/SettingsPage.tsx`, `apps/web/src/features/settings/SettingsPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`, `apps/web/src/app/navigation.ts`

**Interfaces:**
- Consumes: `GET/PUT /api/settings/financial` (`FinancialSettingsResponse`), `useFinancialSettings`, `ProgressBar`.
- Produces: ruta `/settings` ("Configuración" en Más y en la barra lateral): cinco porcentajes con total en vivo (no deja guardar si no suman 100), ingreso mensual estimado, umbral de dinero bajo y "objetivo vs. real" por bolsa.

- [ ] **Step 1: Escribir el test**

Create `apps/web/src/features/settings/SettingsPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { SettingsPage } from './SettingsPage';

afterEach(() => vi.unstubAllGlobals());

const response = {
  settings: {
    obligationsPct: 50,
    savingsPct: 20,
    investmentPct: 10,
    leisurePct: 10,
    otherPct: 10,
    monthlyIncomeEstimate: null,
    lowBalanceThreshold: 100_000,
  },
  month: {
    key: '2026-10',
    projectedIncome: 4_000_000,
    buckets: [
      { key: 'OBLIGATIONS', label: 'Obligaciones', pct: 50, target: 2_000_000, actual: 1_500_000 },
      { key: 'SAVINGS', label: 'Ahorro', pct: 20, target: 800_000, actual: 400_000 },
      { key: 'INVESTMENT', label: 'Inversión', pct: 10, target: 400_000, actual: 0 },
      { key: 'LEISURE', label: 'Entretenimiento', pct: 10, target: 400_000, actual: 380_000 },
      { key: 'OTHER', label: 'Otros', pct: 10, target: 400_000, actual: 100_000 },
    ],
  },
};

describe('SettingsPage', () => {
  it('only saves percentages that add up to 100', async () => {
    const puts: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /settings/financial': () => ({ status: 200, body: response }),
      'PUT /settings/financial': (body) => {
        puts.push(body);
        return { status: 200, body: response };
      },
    });
    renderWithProviders(<SettingsPage />);
    const savings = await screen.findByLabelText('Ahorro (%)');
    await userEvent.clear(savings);
    await userEvent.type(savings, '25');
    expect(screen.getByText(/Total: 105 %/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar configuración' })).toBeDisabled();

    const other = screen.getByLabelText('Otros (%)');
    await userEvent.clear(other);
    await userEvent.type(other, '5');
    expect(screen.getByText('Total: 100 %')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    await waitFor(() =>
      expect(puts).toEqual([
        {
          obligationsPct: 50,
          savingsPct: 25,
          investmentPct: 10,
          leisurePct: 10,
          otherPct: 5,
          monthlyIncomeEstimate: null,
          lowBalanceThreshold: 100_000,
        },
      ]),
    );
    expect(screen.getByRole('progressbar', { name: 'Entretenimiento' })).toHaveAttribute('aria-valuenow', '95');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -w @finanzas/web -- src/features/settings`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Página**

Create `apps/web/src/features/settings/SettingsPage.tsx`:

```tsx
import { formatCOP, type FinancialSettingsResponse } from '@finanzas/shared';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/EmptyState';
import { Field, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { monthLabel } from '../../lib/format';
import { useFinancialSettings } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';

type PctKey = 'obligationsPct' | 'savingsPct' | 'investmentPct' | 'leisurePct' | 'otherPct';

const PCT_FIELDS: Array<{ key: PctKey; label: string; hint: string }> = [
  { key: 'obligationsPct', label: 'Obligaciones', hint: 'Vivienda, servicios, transporte, salud' },
  { key: 'savingsPct', label: 'Ahorro', hint: 'Lo que transfieres a cuentas de ahorro' },
  { key: 'investmentPct', label: 'Inversión', hint: 'Lo que transfieres a cuentas de inversión' },
  { key: 'leisurePct', label: 'Entretenimiento', hint: 'Salidas, suscripciones, gustos' },
  { key: 'otherPct', label: 'Otros', hint: 'Lo demás' },
];

export function SettingsPage() {
  const settings = useFinancialSettings();
  if (settings.isPending) return <PageSpinner />;
  if (settings.isError)
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  return <SettingsForm data={settings.data} />;
}

function SettingsForm({ data }: { data: FinancialSettingsResponse }) {
  const [pcts, setPcts] = useState<Record<PctKey, string>>(
    () =>
      Object.fromEntries(PCT_FIELDS.map((f) => [f.key, String(data.settings[f.key])])) as Record<
        PctKey,
        string
      >,
  );
  const [estimate, setEstimate] = useState<number | null>(data.settings.monthlyIncomeEstimate);
  const [threshold, setThreshold] = useState<number | null>(data.settings.lowBalanceThreshold);
  const [error, setError] = useState<string | null>(null);
  const save = useCrudMutation(
    (body: Record<string, unknown>) => api.put('/settings/financial', body),
    'Configuración guardada',
  );
  const values = Object.fromEntries(
    PCT_FIELDS.map((f) => [f.key, Number(pcts[f.key] || 0)]),
  ) as Record<PctKey, number>;
  const total = PCT_FIELDS.reduce((s, f) => s + values[f.key], 0);
  const income = data.month.projectedIncome;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <Card>
        <CardTitle>Cómo repartir tu ingreso</CardTitle>
        <p className="mt-1 text-sm text-muted">
          Ingreso proyectado de {monthLabel(data.month.key)}: <Amount value={income} className="text-fg" />
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                ...values,
                monthlyIncomeEstimate: estimate || null,
                lowBalanceThreshold: threshold ?? 0,
              },
              { onError: (err) => setError(err.fields?.total ?? err.message) },
            );
          }}
        >
          {PCT_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={`${f.label} (%)`}
              htmlFor={`pct-${f.key}`}
              hint={`${f.hint}. ≈ ${formatCOP(Math.round((income * values[f.key]) / 100))} al mes.`}
            >
              <TextInput
                id={`pct-${f.key}`}
                inputMode="numeric"
                value={pcts[f.key]}
                onChange={(e) =>
                  setPcts((p) => ({ ...p, [f.key]: e.target.value.replace(/\D/g, '').slice(0, 3) }))
                }
              />
            </Field>
          ))}
          <p
            role="status"
            className={cn('text-sm font-medium', total === 100 ? 'text-positive' : 'text-negative')}
          >
            {total === 100 ? 'Total: 100 %' : `Total: ${total} % — deben sumar 100 %`}
          </p>
          <Field
            label="Ingreso mensual estimado (opcional)"
            htmlFor="income-estimate"
            hint="Se usa cuando aún no registras ingresos del mes."
          >
            <MoneyInput id="income-estimate" value={estimate} onChange={setEstimate} />
          </Field>
          <Field
            label="Avisarme si mi disponible baja de"
            htmlFor="low-balance"
            hint="Genera la alerta de dinero bajo."
          >
            <MoneyInput id="low-balance" value={threshold} onChange={setThreshold} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={total !== 100} loading={save.isPending}>
            Guardar configuración
          </Button>
        </form>
      </Card>
      <Card>
        <CardTitle>Este mes: objetivo vs. real</CardTitle>
        <ul className="mt-3 space-y-3">
          {data.month.buckets.map((b) => (
            <li key={b.key} className="space-y-1">
              <div className="flex justify-between gap-2 text-sm">
                <span>
                  {b.label} · {b.pct} %
                </span>
                <span>
                  <Amount value={b.actual} /> de <Amount value={b.target} />
                </span>
              </div>
              <ProgressBar
                value={b.target > 0 ? b.actual / b.target : 0}
                label={b.label}
                tone={b.key === 'SAVINGS' || b.key === 'INVESTMENT' ? 'positive' : 'auto'}
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Ruta y navegación**

En `apps/web/src/app/router.tsx`, agregar a `appRoutes` (antes de `/profile`):

```tsx
  {
    path: '/settings',
    lazy: page(
      () => import('../features/settings/SettingsPage'),
      (m) => m.SettingsPage,
    ),
  },
```

En `apps/web/src/app/navigation.ts`, importar `SlidersHorizontal` e insertar antes de "Perfil y seguridad":

```ts
  { to: '/settings', label: 'Configuración', icon: SlidersHorizontal },
```

- [ ] **Step 5: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): configuración financiera con porcentajes objetivo"
```

---

### Task 8: Presupuestos

**Files:**
- Create: `apps/web/src/features/budgets/BudgetsPage.tsx`, `apps/web/src/features/budgets/BudgetEditorSheet.tsx`, `apps/web/src/features/budgets/BudgetsPage.test.tsx`
- Delete: `apps/web/src/features/more/BudgetsPage.tsx`
- Modify: `apps/web/src/app/router.tsx` (ruta `/budgets`)

**Interfaces:**
- Consumes: `GET/PUT/DELETE /api/budgets/:month` (`BudgetDTO`), `useBudget`, `useCategories`, `ProgressBar`, `formatMonthYear`, `refName`.
- Produces: pantalla de presupuestos con selector de mes, total con barra, proyección ("A este ritmo superarías el presupuesto el día N."), líneas por categoría, editor (total opcional, agregar/editar/quitar líneas) y "Eliminar presupuesto" del mes.

- [ ] **Step 1: Escribir los tests**

Create `apps/web/src/features/budgets/BudgetsPage.test.tsx`:

```tsx
import { addMonths, monthKey, todayIn } from '@finanzas/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { BudgetsPage } from './BudgetsPage';

afterEach(() => vi.unstubAllGlobals());

const month = monthKey(todayIn('America/Bogota'));
const previous = monthKey(addMonths(`${month}-01`, -1));
const food = {
  id: 'k1',
  name: 'Alimentación',
  kind: 'EXPENSE',
  parentId: null,
  bucket: 'OBLIGATIONS',
  icon: 'utensils',
  color: '#f97316',
  isSystem: false,
  systemKey: null,
  isActive: true,
  sortOrder: 1,
};
const empty = (m: string) => ({
  month: m,
  totalAmount: null,
  lines: [],
  total: null,
  projection: null,
  daysLeft: 10,
  copiedFrom: null,
});

describe('BudgetsPage (spec 8.9)', () => {
  it('creates the budget of the month', async () => {
    const puts: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      [`GET /budgets/${month}`]: () => ({ status: 200, body: { budget: empty(month) } }),
      'GET /categories': () => ({ status: 200, body: { items: [food] } }),
      [`PUT /budgets/${month}`]: (body) => {
        puts.push(body);
        return { status: 200, body: { budget: empty(month) } };
      },
    });
    renderWithProviders(<BudgetsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Crear presupuesto' }));
    await userEvent.type(screen.getByLabelText('Presupuesto general (opcional)'), '2000000');
    await userEvent.selectOptions(screen.getByLabelText('Agregar categoría'), 'k1');
    await userEvent.type(screen.getByLabelText('Alimentación'), '600000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));
    await waitFor(() =>
      expect(puts).toEqual([
        { totalAmount: 2_000_000, lines: [{ categoryId: 'k1', amount: 600_000 }] },
      ]),
    );
  });

  it('shows the usage per category and the projection', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      [`GET /budgets/${month}`]: () => ({
        status: 200,
        body: {
          budget: {
            month,
            totalAmount: 2_000_000,
            lines: [
              {
                id: 'l1',
                category: { id: 'k1', name: 'Alimentación', icon: 'utensils', color: '#f97316', isActive: true, kind: 'EXPENSE', parentId: null },
                amount: 600_000,
                spent: 570_000,
                remaining: 30_000,
                usage: 0.95,
              },
            ],
            total: { budget: 2_000_000, spent: 1_200_000, remaining: 800_000, usage: 0.6 },
            projection: { projectedSpend: 2_400_000, exceedsOnDay: 25 },
            daysLeft: 10,
            copiedFrom: previous,
          },
        },
      }),
    });
    renderWithProviders(<BudgetsPage />);
    expect(
      await screen.findByText('A este ritmo superarías el presupuesto el día 25.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Uso de Alimentación' })).toHaveAttribute(
      'aria-valuenow',
      '95',
    );
    expect(screen.getByText(/Copiamos el presupuesto de/)).toBeInTheDocument();
  });

  it('moves to the previous month', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      [`GET /budgets/${month}`]: () => ({ status: 200, body: { budget: empty(month) } }),
      [`GET /budgets/${previous}`]: () => ({ status: 200, body: { budget: empty(previous) } }),
    });
    renderWithProviders(<BudgetsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Mes anterior' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === `/api/budgets/${previous}`)).toBe(true),
    );
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/features/budgets`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Editor**

Create `apps/web/src/features/budgets/BudgetEditorSheet.tsx`:

```tsx
import { formatCOP, type BudgetDTO } from '@finanzas/shared';
import { X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api } from '../../lib/api';
import { formatMonthYear } from '../../lib/format';
import { useCategories } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';

interface Line {
  categoryId: string;
  amount: number | null;
}

export function BudgetEditorSheet({
  open,
  onOpenChange,
  month,
  budget,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  month: string;
  budget: BudgetDTO;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`Presupuesto de ${formatMonthYear(month)}`}>
      {open && <BudgetEditor month={month} budget={budget} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function BudgetEditor({
  month,
  budget,
  onDone,
}: {
  month: string;
  budget: BudgetDTO;
  onDone: () => void;
}) {
  const categories = useCategories();
  const [total, setTotal] = useState<number | null>(budget.totalAmount);
  const [lines, setLines] = useState<Line[]>(
    budget.lines.map((l) => ({ categoryId: l.category.id, amount: l.amount })),
  );
  const [error, setError] = useState<string | null>(null);
  const save = useCrudMutation(
    (body: Record<string, unknown>) => api.put(`/budgets/${month}`, body),
    'Presupuesto guardado',
  );
  const all = categories.data ?? [];
  const nameOf = (id: string) => all.find((c) => c.id === id)?.name ?? 'Categoría';
  const available = all.filter(
    (c) =>
      c.kind === 'EXPENSE' &&
      c.isActive &&
      !c.isSystem &&
      !lines.some((l) => l.categoryId === c.id),
  );
  const linesSum = lines.reduce((s, l) => s + (l.amount ?? 0), 0);

  const submit = () => {
    if (lines.some((l) => !l.amount)) return setError('Escribe el valor de cada categoría');
    if (!total && lines.length === 0)
      return setError('Escribe un total o agrega al menos una categoría');
    setError(null);
    save.mutate(
      {
        totalAmount: total || null,
        lines: lines.map((l) => ({ categoryId: l.categoryId, amount: l.amount })),
      },
      { onSuccess: onDone, onError: (err) => setError(err.message) },
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
      <Field
        label="Presupuesto general (opcional)"
        htmlFor="budget-total"
        hint={`Si lo dejas vacío, el presupuesto es la suma de las categorías (${formatCOP(linesSum)}) y solo cuenta su gasto.`}
      >
        <MoneyInput id="budget-total" value={total} onChange={setTotal} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Por categoría</p>
        {lines.map((l, i) => (
          <div key={l.categoryId} className="flex items-center gap-2">
            <label htmlFor={`line-${l.categoryId}`} className="w-32 shrink-0 truncate text-sm">
              {nameOf(l.categoryId)}
            </label>
            <MoneyInput
              id={`line-${l.categoryId}`}
              value={l.amount}
              onChange={(v) =>
                setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amount: v } : x)))
              }
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Quitar ${nameOf(l.categoryId)}`}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
            >
              <X size={16} />
            </Button>
          </div>
        ))}
        {available.length > 0 && (
          <Select
            aria-label="Agregar categoría"
            value=""
            onChange={(e) =>
              e.target.value &&
              setLines((ls) => [...ls, { categoryId: e.target.value, amount: null }])
            }
          >
            <option value="">+ Agregar categoría</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar presupuesto
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Página**

Create `apps/web/src/features/budgets/BudgetsPage.tsx`:

```tsx
import { addMonths, formatCOP, monthKey, type BudgetDTO } from '@finanzas/shared';
import { ChartPie, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatMonthYear, formatPercent } from '../../lib/format';
import { Icon } from '../../lib/icons';
import { useBudget } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { BudgetEditorSheet } from './BudgetEditorSheet';

export function BudgetsPage() {
  const today = useToday();
  const [month, setMonth] = useState(() => monthKey(today));
  const budget = useBudget(month);
  const [editing, setEditing] = useState(false);
  const clear = useCrudMutation(() => api.del(`/budgets/${month}`), 'Presupuesto eliminado');
  const shift = (n: number) => setMonth((m) => monthKey(addMonths(`${m}-01`, n)));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Presupuestos</h1>
      <div className="flex items-center justify-between rounded-2xl bg-surface p-1 ring-1 ring-border">
        <Button variant="ghost" aria-label="Mes anterior" onClick={() => shift(-1)}>
          <ChevronLeft size={18} />
        </Button>
        <span className="font-medium">{formatMonthYear(month)}</span>
        <Button variant="ghost" aria-label="Mes siguiente" onClick={() => shift(1)}>
          <ChevronRight size={18} />
        </Button>
      </div>
      {budget.isPending ? (
        <PageSpinner />
      ) : budget.isError ? (
        <ErrorState error={budget.error} onRetry={() => void budget.refetch()} />
      ) : (
        <BudgetView
          budget={budget.data}
          onEdit={() => setEditing(true)}
          onClear={() => clear.mutate()}
          clearing={clear.isPending}
        />
      )}
      {budget.data && (
        <BudgetEditorSheet
          open={editing}
          onOpenChange={setEditing}
          month={month}
          budget={budget.data}
        />
      )}
    </div>
  );
}

function BudgetView({
  budget,
  onEdit,
  onClear,
  clearing,
}: {
  budget: BudgetDTO;
  onEdit: () => void;
  onClear: () => void;
  clearing: boolean;
}) {
  if (!budget.total) {
    return (
      <EmptyState
        icon={<ChartPie />}
        title={`Sin presupuesto para ${formatMonthYear(budget.month)}`}
        description="Define un presupuesto general y por categoría. Te avisaremos al 50, 75, 90 y 100 %."
        action={<Button onClick={onEdit}>Crear presupuesto</Button>}
      />
    );
  }
  const { total } = budget;
  return (
    <>
      {budget.copiedFrom && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
          Copiamos el presupuesto de {formatMonthYear(budget.copiedFrom)}. Ajústalo si lo necesitas.
        </p>
      )}
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>Presupuesto del mes</CardTitle>
          <Amount value={total.budget} className="font-semibold" />
        </div>
        <p className="mt-2 text-sm">
          Gastado <Amount value={total.spent} className="font-medium" /> ·{' '}
          {total.remaining >= 0 ? (
            <>
              quedan <Amount value={total.remaining} className="font-medium" />
            </>
          ) : (
            <>
              te pasaste <Amount value={-total.remaining} tone="debt" className="font-medium" />
            </>
          )}
        </p>
        <div className="mt-2">
          <ProgressBar value={total.usage} label="Uso del presupuesto del mes" />
        </div>
        <p className="mt-2 text-xs text-muted">
          {formatPercent(total.usage)} usado
          {budget.daysLeft !== null ? ` · quedan ${budget.daysLeft} días` : ''}
        </p>
        {budget.projection?.exceedsOnDay && (
          <p className="mt-2 text-sm text-warning">
            A este ritmo superarías el presupuesto el día {budget.projection.exceedsOnDay}.
          </p>
        )}
        {budget.totalAmount === null && (
          <p className="mt-2 text-xs text-muted">
            Sin total general: el presupuesto es la suma de las categorías y solo cuenta su gasto.
          </p>
        )}
      </Card>
      {budget.lines.length > 0 && (
        <section>
          <CardTitle className="mb-2 px-1">Por categoría</CardTitle>
          <ul className="space-y-2">
            {budget.lines.map((l) => (
              <li key={l.id} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon name={l.category.icon} size={16} />
                    <span className="truncate font-medium">{refName(l.category)}</span>
                  </span>
                  <span className="text-sm">
                    <Amount value={l.spent} /> de <Amount value={l.amount} />
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={l.usage} label={`Uso de ${l.category.name}`} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {l.remaining >= 0
                    ? `Quedan ${formatCOP(l.remaining)}`
                    : `Te pasaste ${formatCOP(-l.remaining)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Editar presupuesto
        </Button>
        <ConfirmButton loading={clearing} onConfirm={onClear}>
          Eliminar presupuesto
        </ConfirmButton>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Ruta**

En `apps/web/src/app/router.tsx`, cambiar la ruta `/budgets` a:

```tsx
  {
    path: '/budgets',
    lazy: page(
      () => import('../features/budgets/BudgetsPage'),
      (m) => m.BudgetsPage,
    ),
  },
```

y borrar `apps/web/src/features/more/BudgetsPage.tsx`.

- [ ] **Step 6: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): presupuestos mensuales con proyección y editor por categoría"
```

---

### Task 9: Metas

**Files:**
- Create: `apps/web/src/features/goals/GoalsPage.tsx`, `GoalFormSheet.tsx`, `GoalMoneySheet.tsx`, `GoalsPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`, `apps/web/src/app/navigation.ts`

**Interfaces:**
- Consumes: `GET/POST /api/goals`, `PUT/DELETE /api/goals/:id`, `POST /api/goals/:id/contributions|withdrawals` (plan 2A Task 13); `useGoals`, `useAccounts`, `useSaveTransaction`, `NeedsAccount`, `ProgressBar`.
- Produces: ruta `/goals` ("Metas" en Más, después de "Préstamos"): metas activas con avance, cuánto ahorrar al mes y a la semana, Abonar / Retirar / Editar, "Marcar como completada" al llegar al 100 % y sección "Completadas" con "Reabrir".

- [ ] **Step 1: Escribir los tests**

Create `apps/web/src/features/goals/GoalsPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { GoalsPage } from './GoalsPage';

afterEach(() => vi.unstubAllGlobals());

const savings = {
  id: 'a2',
  name: 'Bolsillo ahorro',
  type: 'SAVINGS',
  institution: null,
  initialBalance: 0,
  openingDate: '2026-10-01',
  icon: 'piggy-bank',
  color: '#0ea5e9',
  isActive: true,
  sortOrder: 1,
  balance: 1_400_000,
};
const bank = { ...savings, id: 'a1', name: 'Bancolombia', type: 'BANK', icon: 'landmark' };
const goal = {
  id: 'g1',
  name: 'Comprar computador',
  targetAmount: 5_000_000,
  targetDate: '2027-06-30',
  account: { id: 'a2', name: 'Bolsillo ahorro', icon: 'piggy-bank', color: '#0ea5e9', isActive: true, type: 'SAVINGS' },
  initialAmount: 1_000_000,
  status: 'ACTIVE',
  icon: 'laptop',
  color: '#0ea5e9',
  contributed: 500_000,
  withdrawn: 100_000,
  progress: 1_400_000,
  pct: 0.28,
  remaining: 3_600_000,
  monthlyNeeded: 450_000,
  weeklyNeeded: 94_737,
};

describe('GoalsPage (spec 8.10)', () => {
  it('shows progress and what to save per month and week', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
    });
    renderWithProviders(<GoalsPage />);
    expect(await screen.findByText('Comprar computador')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance de Comprar computador' })).toHaveAttribute(
      'aria-valuenow',
      '28',
    );
    expect(
      screen.getByText('Te faltan $3.600.000: ahorra $450.000 al mes ($94.737 a la semana).'),
    ).toBeInTheDocument();
  });

  it('adds money to a goal as a transfer from another account', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /goals': () => ({ status: 200, body: { items: [goal] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'POST /goals/g1/contributions': (body) => {
        posted.push(body);
        return { status: 201, body: { transaction: { id: 't1' }, warnings: [], goal } };
      },
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abonar' }));
    await userEvent.type(await screen.findByLabelText('Valor'), '200000');
    await userEvent.selectOptions(screen.getByLabelText('Desde la cuenta'), 'a1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(posted).toEqual([{ fromAccountId: 'a1', amount: 200_000, date: expect.any(String) }]),
    );
  });

  it('creates a goal in a savings account', async () => {
    const posted: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /goals': () => ({ status: 200, body: { items: [] } }),
      'GET /accounts': () => ({ status: 200, body: { items: [bank, savings] } }),
      'POST /goals': (body) => {
        posted.push(body);
        return { status: 201, body: { goal } };
      },
    });
    renderWithProviders(<GoalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva meta' }));
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Viaje');
    await userEvent.type(screen.getByLabelText('Valor objetivo'), '3000000');
    expect(screen.queryByRole('option', { name: 'Bancolombia' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar meta' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      name: 'Viaje',
      targetAmount: 3_000_000,
      targetDate: null,
      accountId: 'a2',
      initialAmount: 0,
    });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/features/goals`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Formulario de meta**

Create `apps/web/src/features/goals/GoalFormSheet.tsx`:

```tsx
import type { GoalDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { PageSpinner } from '../../components/ui/Spinner';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useAccounts } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { NeedsAccount } from '../quick-add/NeedsAccount';

export function GoalFormSheet({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal?: GoalDTO;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={goal ? 'Editar meta' : 'Nueva meta'}>
      {open && <GoalForm goal={goal} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function GoalForm({ goal, onDone }: { goal?: GoalDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState<number | null>(goal?.targetAmount ?? null);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [accountId, setAccountId] = useState(goal?.account.id ?? '');
  const [initial, setInitial] = useState<number | null>(goal?.initialAmount ?? null);
  const [icon, setIcon] = useState(goal?.icon ?? 'target');
  const [color, setColor] = useState(goal?.color ?? '#0ea5e9');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      goal ? api.put(`/goals/${goal.id}`, body) : api.post('/goals', body),
    goal ? 'Meta actualizada' : 'Meta creada',
  );
  const remove = useCrudMutation(() => api.del(`/goals/${goal!.id}`), 'Meta eliminada');
  const onError = (err: ApiError) =>
    setFields(toFormErrors(err, ['name', 'targetAmount', 'targetDate', 'accountId']));

  if (accounts.isPending) return <PageSpinner />;
  const reserved = (accounts.data ?? []).filter(
    (a) => (a.isActive && (a.type === 'SAVINGS' || a.type === 'INVESTMENT')) || a.id === goal?.account.id,
  );
  if (reserved.length === 0)
    return (
      <NeedsAccount
        onNavigate={onDone}
        title="Primero crea una cuenta de ahorro o inversión"
        description="El dinero de una meta vive en una cuenta de ahorro o inversión: abonar es transferir a esa cuenta, no gastar."
      />
    );
  const chosenAccount = accountId || reserved[0]!.id;

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!target) next.targetAmount = 'Escribe cuánto quieres reunir';
    setFields(next);
    if (Object.keys(next).length > 0) return;
    save.mutate(
      {
        name,
        targetAmount: target,
        targetDate: targetDate || null,
        accountId: chosenAccount,
        initialAmount: initial ?? 0,
        icon,
        color,
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
      <Field label="Nombre" htmlFor="goal-name" error={fields.name}>
        <TextInput
          id="goal-name"
          maxLength={60}
          placeholder="Comprar computador"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Valor objetivo" htmlFor="goal-target" error={fields.targetAmount}>
        <MoneyInput id="goal-target" value={target} onChange={setTarget} />
      </Field>
      <Field
        label="Fecha objetivo (opcional)"
        htmlFor="goal-date"
        error={fields.targetDate}
        hint="Con fecha te decimos cuánto ahorrar cada mes y cada semana."
      >
        <TextInput
          id="goal-date"
          type="date"
          min={today}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </Field>
      <Field label="Cuenta donde guardas el dinero" htmlFor="goal-account" error={fields.accountId}>
        <Select id="goal-account" value={chosenAccount} onChange={(e) => setAccountId(e.target.value)}>
          {reserved.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Ya tengo ahorrado (opcional)"
        htmlFor="goal-initial"
        hint="Lo que ya tienes para esta meta. No crea movimientos."
      >
        <MoneyInput id="goal-initial" value={initial} onChange={setInitial} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Ícono</p>
        <IconPicker value={icon} onChange={setIcon} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {fields._ && (
        <p role="alert" className="text-sm text-negative">
          {fields._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar meta
      </Button>
      {goal && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar meta
          </ConfirmButton>
          <p className="text-xs text-muted">
            Sus abonos y retiros quedan como transferencias normales.
          </p>
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Abonar y retirar**

Create `apps/web/src/features/goals/GoalMoneySheet.tsx`:

```tsx
import type { GoalDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { useAccounts } from '../../lib/queries';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';
import { useSaveTransaction } from '../quick-add/useSaveTransaction';

export type GoalMoneyMode = 'contribute' | 'withdraw';

export function GoalMoneySheet({
  target,
  onClose,
}: {
  target: { goal: GoalDTO; mode: GoalMoneyMode } | null;
  onClose: () => void;
}) {
  const title = !target
    ? ''
    : target.mode === 'contribute'
      ? `Abonar a ${target.goal.name}`
      : `Retirar de ${target.goal.name}`;
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Es una transferencia entre tus cuentas: no es un gasto ni un ingreso."
    >
      {target && <GoalMoneyForm goal={target.goal} mode={target.mode} onDone={onClose} />}
    </Sheet>
  );
}

function GoalMoneyForm({
  goal,
  mode,
  onDone,
}: {
  goal: GoalDTO;
  mode: GoalMoneyMode;
  onDone: () => void;
}) {
  const today = useToday();
  const accounts = useAccounts();
  const [amount, setAmount] = useState<number | null>(null);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveTransaction(mode === 'contribute' ? 'Abono registrado' : 'Retiro registrado');
  const others = (accounts.data ?? []).filter((a) => a.isActive && a.id !== goal.account.id);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!amount || !accountId) return setError('Escribe el valor y elige la cuenta');
        save.submit(
          {
            path: `/goals/${goal.id}/${mode === 'contribute' ? 'contributions' : 'withdrawals'}`,
            method: 'POST',
            body:
              mode === 'contribute'
                ? { fromAccountId: accountId, amount, date }
                : { toAccountId: accountId, amount, date },
          },
          { onSuccess: onDone, onError: (err) => setError(err.message) },
        );
      }}
    >
      <Field label="Valor" htmlFor="goal-money-amount">
        <MoneyInput id="goal-money-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field
        label={mode === 'contribute' ? 'Desde la cuenta' : 'Hacia la cuenta'}
        htmlFor="goal-money-account"
      >
        <Select id="goal-money-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <DateChips value={date} onChange={setDate} today={today} />
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Página de metas**

Create `apps/web/src/features/goals/GoalsPage.tsx`:

```tsx
import { formatCOP, type GoalDTO } from '@finanzas/shared';
import { Plus, Target } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { CardTitle } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatDate, formatPercent } from '../../lib/format';
import { Icon } from '../../lib/icons';
import { useGoals } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { useCrudMutation } from '../../lib/useCrud';
import { GoalFormSheet } from './GoalFormSheet';
import { GoalMoneySheet, type GoalMoneyMode } from './GoalMoneySheet';

export function GoalsPage() {
  const goals = useGoals();
  const [form, setForm] = useState<{ open: boolean; goal?: GoalDTO }>({ open: false });
  const [money, setMoney] = useState<{ goal: GoalDTO; mode: GoalMoneyMode } | null>(null);
  const setStatus = useCrudMutation(
    (v: { id: string; status: 'ACTIVE' | 'COMPLETED' }) =>
      api.put(`/goals/${v.id}`, { status: v.status }),
    'Meta actualizada',
  );
  if (goals.isPending) return <PageSpinner />;
  if (goals.isError) return <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />;
  const active = goals.data.filter((g) => g.status === 'ACTIVE');
  const done = goals.data.filter((g) => g.status === 'COMPLETED');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Metas</h1>
        <Button size="sm" aria-label="Nueva meta" onClick={() => setForm({ open: true })}>
          <Plus size={16} /> Nueva
        </Button>
      </div>
      {goals.data.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="Aún no tienes metas"
          description="Una meta vive en una cuenta de ahorro o inversión: abonar es transferir, no gastar."
        />
      ) : (
        <ul className="space-y-3">
          {active.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onContribute={() => setMoney({ goal: g, mode: 'contribute' })}
              onWithdraw={() => setMoney({ goal: g, mode: 'withdraw' })}
              onEdit={() => setForm({ open: true, goal: g })}
              onComplete={() => setStatus.mutate({ id: g.id, status: 'COMPLETED' })}
            />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section>
          <CardTitle className="mb-2 px-1">Completadas</CardTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {done.map((g) => (
              <li key={g.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0 truncate">
                  {g.name} · <Amount value={g.progress} tone="balance" />
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setStatus.mutate({ id: g.id, status: 'ACTIVE' })}
                >
                  Reabrir
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <GoalFormSheet
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        goal={form.goal}
      />
      <GoalMoneySheet target={money} onClose={() => setMoney(null)} />
    </div>
  );
}

function GoalCard({
  goal,
  onContribute,
  onWithdraw,
  onEdit,
  onComplete,
}: {
  goal: GoalDTO;
  onContribute: () => void;
  onWithdraw: () => void;
  onEdit: () => void;
  onComplete: () => void;
}) {
  return (
    <li className="rounded-2xl bg-surface p-4 ring-1 ring-border">
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: goal.color }}
        >
          <Icon name={goal.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{goal.name}</p>
          <p className="text-xs text-muted">
            En {refName(goal.account)}
            {goal.targetDate ? ` · para el ${formatDate(goal.targetDate)}` : ''}
          </p>
        </div>
        <span className="text-sm font-medium">{formatPercent(goal.pct)}</span>
      </div>
      <p className="mt-3 text-sm">
        <Amount value={goal.progress} tone="balance" className="font-semibold" /> de{' '}
        <Amount value={goal.targetAmount} />
      </p>
      <div className="mt-2">
        <ProgressBar value={goal.pct} label={`Avance de ${goal.name}`} tone="positive" />
      </div>
      {goal.pct >= 1 ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-positive/10 p-3 text-sm text-positive">
          ¡Llegaste a la meta!
          <Button size="sm" onClick={onComplete}>
            Marcar como completada
          </Button>
        </div>
      ) : goal.monthlyNeeded !== null ? (
        <p className="mt-2 text-xs text-muted">
          Te faltan {formatCOP(goal.remaining)}: ahorra {formatCOP(goal.monthlyNeeded)} al mes (
          {formatCOP(goal.weeklyNeeded ?? 0)} a la semana).
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">Te faltan {formatCOP(goal.remaining)}.</p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" onClick={onContribute}>
          Abonar
        </Button>
        <Button size="sm" variant="secondary" disabled={goal.progress <= 0} onClick={onWithdraw}>
          Retirar
        </Button>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Editar
        </Button>
      </div>
    </li>
  );
}
```

Nota: el texto "ahorra … al mes (…) a la semana)" debe quedar en un solo nodo de texto continuo para el test; si Prettier lo parte en varias líneas JSX, las expresiones `{…}` se mantienen y el texto renderizado es el mismo.

- [ ] **Step 6: Ruta y navegación**

En `apps/web/src/app/router.tsx`, agregar a `appRoutes`:

```tsx
  {
    path: '/goals',
    lazy: page(
      () => import('../features/goals/GoalsPage'),
      (m) => m.GoalsPage,
    ),
  },
```

En `apps/web/src/app/navigation.ts`, importar `Target` e insertar después de "Préstamos":

```ts
  { to: '/goals', label: 'Metas', icon: Target },
```

- [ ] **Step 7: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): metas con abonos, retiros y ahorro necesario"
```

---

### Task 10: Recurrentes y obligaciones

**Files:**
- Create: `apps/web/src/features/recurring/RecurringPage.tsx`, `RuleFormSheet.tsx`, `ScheduledFormSheet.tsx`, `CompleteSheet.tsx`, `sources.ts`, `RecurringPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`, `apps/web/src/app/navigation.ts`

**Interfaces:**
- Consumes: `GET /api/scheduled?to=…` (con derivados `CARD`/`LOAN`), `POST /api/scheduled`, `PUT /api/scheduled/:id`, `POST /api/scheduled/:id/complete|skip`, `DELETE /api/scheduled/:id`, `GET/POST /api/recurring`, `PUT/DELETE /api/recurring/:id` (plan 2A Tasks 10 y 11); `useScheduled`, `useRules`, `useQuickAdd`, `useSaveTransaction`.
- Produces:
  - `sources.ts`: `sourceOptions(accounts, cards, kind, keepIds)`, `sourceBody(value: string): { accountId: string | null; creditCardId: string | null }`, `sourceValue(account, creditCard)`.
  - Ruta `/recurring` ("Recurrentes y obligaciones" en Más, después de "Metas"): "Próximos 30 días" (Pagar/Recibir, Omitir, Editar, Eliminar solo en pagos únicos; tarjetas y préstamos con Pagar y enlace) y "Reglas" (crear, editar, pausar o reanudar, eliminar).

- [ ] **Step 1: Escribir los tests**

Create `apps/web/src/features/recurring/RecurringPage.test.tsx`:

```tsx
import { addDays, todayIn } from '@finanzas/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { QuickAddProvider } from '../quick-add/QuickAddContext';
import { RecurringPage } from './RecurringPage';

afterEach(() => vi.unstubAllGlobals());

const today = todayIn('America/Bogota');
const accountRef = { id: 'a1', name: 'Bancolombia', icon: 'landmark', color: '#ca8a04', isActive: true, type: 'BANK' };
const account = {
  ...accountRef,
  institution: null,
  initialBalance: 0,
  openingDate: '2026-01-01',
  sortOrder: 0,
  balance: 2_000_000,
};
const category = {
  id: 'k1',
  name: 'Vivienda',
  kind: 'EXPENSE',
  parentId: null,
  bucket: 'OBLIGATIONS',
  icon: 'home',
  color: '#0ea5e9',
  isSystem: false,
  systemKey: null,
  isActive: true,
  sortOrder: 0,
};
const item = (over: Record<string, unknown>) => ({
  id: 's1',
  kind: 'EXPENSE',
  name: 'Arriendo',
  amount: 1_000_000,
  dueDate: addDays(today, -2),
  ruleDate: addDays(today, -2),
  status: 'PENDING',
  category: { ...category, isActive: true },
  account: accountRef,
  creditCard: null,
  recurringRuleId: 'r1',
  transactionId: null,
  derived: null,
  sourceId: null,
  ...over,
});

function setup(routes: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
    'GET /scheduled': () => ({
      status: 200,
      body: {
        items: [
          item({}),
          item({
            id: 'card:c1',
            name: 'Pago Nu Crédito',
            dueDate: addDays(today, 5),
            ruleDate: null,
            derived: 'CARD',
            sourceId: 'c1',
            recurringRuleId: null,
            account: null,
            category: null,
          }),
        ],
      },
    }),
    'GET /recurring': () => ({ status: 200, body: { items: [] } }),
    'GET /accounts': () => ({ status: 200, body: { items: [account] } }),
    'GET /credit-cards': () => ({ status: 200, body: { items: [] } }),
    'GET /categories': () => ({ status: 200, body: { items: [category] } }),
    ...routes,
  });
}

const render = () =>
  renderWithProviders(
    <QuickAddProvider>
      <RecurringPage />
    </QuickAddProvider>,
  );

describe('RecurringPage (spec 8.11)', () => {
  it('lists what is due in the next 30 days, overdue first, with card dues', async () => {
    setup();
    render();
    expect(await screen.findByText('Arriendo')).toBeInTheDocument();
    expect(screen.getByText(/Vencida el/)).toBeInTheDocument();
    expect(screen.getByText('Pago Nu Crédito')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver tarjeta' })).toHaveAttribute('href', '/cards/c1');
  });

  it('pays an obligation once even with a double tap (review focus #1)', async () => {
    const completed: unknown[] = [];
    let release: () => void = () => undefined;
    setup({
      'POST /scheduled/s1/complete': async (body) => {
        completed.push(body);
        await new Promise<void>((resolve) => (release = resolve));
        return { status: 201, body: { transaction: { id: 't1' }, warnings: [] } };
      },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar Arriendo' }));
    const save = await screen.findByRole('button', { name: 'Guardar pago' });
    await userEvent.dblClick(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(completed).toEqual([{ amount: 1_000_000, date: addDays(today, -2), accountId: 'a1' }]);
    release();
  });

  it('skips an occurrence', async () => {
    const skipped: string[] = [];
    setup({
      'POST /scheduled/s1/skip': () => {
        skipped.push('s1');
        return { status: 200, body: { item: item({ status: 'SKIPPED' }) } };
      },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Omitir Arriendo' }));
    await waitFor(() => expect(skipped).toEqual(['s1']));
  });

  it('creates a monthly rule', async () => {
    const posted: unknown[] = [];
    setup({
      'POST /recurring': (body) => {
        posted.push(body);
        return { status: 201, body: { rule: {} } };
      },
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva regla' }));
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Internet');
    await userEvent.type(screen.getByLabelText('Valor'), '90000');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'k1');
    await userEvent.selectOptions(screen.getByLabelText('Cuenta o tarjeta'), 'account:a1');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar regla' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      name: 'Internet',
      kind: 'EXPENSE',
      amount: 90_000,
      categoryId: 'k1',
      accountId: 'a1',
      creditCardId: null,
      frequency: 'MONTHLY',
      startDate: today,
      endDate: null,
    });
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/features/recurring`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Opciones de cuenta o tarjeta**

Create `apps/web/src/features/recurring/sources.ts`:

```ts
import type { AccountDTO, CreditCardDTO, RefDTO, ScheduledKind } from '@finanzas/shared';

/** Valor de un select de "Cuenta o tarjeta": `account:<id>` o `card:<id>`. */
export function sourceValue(account: RefDTO | null, creditCard: RefDTO | null): string {
  if (creditCard) return `card:${creditCard.id}`;
  if (account) return `account:${account.id}`;
  return '';
}

export function sourceBody(value: string): { accountId: string | null; creditCardId: string | null } {
  const [kind, id = ''] = value.split(':');
  return kind === 'card'
    ? { accountId: null, creditCardId: id }
    : { accountId: id || null, creditCardId: null };
}

/** Un ingreso llega a una cuenta; un gasto sale de una cuenta o de una tarjeta. Se conserva la actual aunque esté eliminada. */
export function sourceOptions(
  accounts: AccountDTO[],
  cards: CreditCardDTO[],
  kind: ScheduledKind,
  keepValue = '',
): Array<{ value: string; label: string }> {
  const keep = (value: string, active: boolean) => active || value === keepValue;
  return [
    ...accounts
      .filter((a) => keep(`account:${a.id}`, a.isActive))
      .map((a) => ({ value: `account:${a.id}`, label: a.name })),
    ...(kind === 'EXPENSE'
      ? cards
          .filter((c) => keep(`card:${c.id}`, c.isActive))
          .map((c) => ({ value: `card:${c.id}`, label: `Tarjeta ${c.name}` }))
      : []),
  ];
}
```

- [ ] **Step 4: Completar una ocurrencia**

Create `apps/web/src/features/recurring/CompleteSheet.tsx`:

```tsx
import type { ScheduledItemDTO } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { useAccounts, useCards } from '../../lib/queries';
import { useToday } from '../auth/useAuth';
import { DateChips } from '../quick-add/DateChips';
import { useSaveTransaction } from '../quick-add/useSaveTransaction';
import { sourceBody, sourceOptions, sourceValue } from './sources';

export function CompleteSheet({
  item,
  onClose,
}: {
  item: ScheduledItemDTO | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(o) => !o && onClose()}
      title={item?.kind === 'INCOME' ? `Recibir ${item.name}` : `Pagar ${item?.name ?? ''}`}
      description="Crea el movimiento real y marca esta ocurrencia como hecha."
    >
      {item && <CompleteForm item={item} onDone={onClose} />}
    </Sheet>
  );
}

function CompleteForm({ item, onDone }: { item: ScheduledItemDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const cards = useCards();
  const [amount, setAmount] = useState<number | null>(item.amount);
  const [source, setSource] = useState(sourceValue(item.account, item.creditCard));
  const [date, setDate] = useState(item.dueDate < today ? item.dueDate : today);
  const [error, setError] = useState<string | null>(null);
  const income = item.kind === 'INCOME';
  const save = useSaveTransaction(income ? 'Ingreso registrado' : 'Pago registrado');
  const options = sourceOptions(accounts.data ?? [], cards.data ?? [], item.kind);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!amount || !source) return setError('Escribe el valor y elige la cuenta');
        const { accountId, creditCardId } = sourceBody(source);
        save.submit(
          {
            path: `/scheduled/${item.id}/complete`,
            method: 'POST',
            body: { amount, date, ...(creditCardId ? { creditCardId } : { accountId }) },
          },
          { onSuccess: onDone, onError: (err) => setError(err.message) },
        );
      }}
    >
      <Field label="Valor" htmlFor="complete-amount">
        <MoneyInput id="complete-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field label={income ? 'Recibido en' : 'Pagado con'} htmlFor="complete-source">
        <Select id="complete-source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Elige una opción</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <DateChips value={date} onChange={setDate} today={today} />
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        {income ? 'Guardar ingreso' : 'Guardar pago'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Pago único o ingreso esperado**

Create `apps/web/src/features/recurring/ScheduledFormSheet.tsx`:

```tsx
import type { ScheduledItemDTO, ScheduledKind } from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useAccounts, useCards, useCategories } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { sourceBody, sourceOptions, sourceValue } from './sources';

export function ScheduledFormSheet({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item?: ScheduledItemDTO;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? 'Editar ocurrencia' : 'Pago único o ingreso esperado'}
    >
      {open && <ScheduledForm item={item} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function ScheduledForm({ item, onDone }: { item?: ScheduledItemDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories();
  const [kind, setKind] = useState<ScheduledKind>(item?.kind ?? 'EXPENSE');
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState<number | null>(item?.amount ?? null);
  const [dueDate, setDueDate] = useState(item?.dueDate ?? today);
  const [categoryId, setCategoryId] = useState(item?.category?.id ?? '');
  const [source, setSource] = useState(item ? sourceValue(item.account, item.creditCard) : '');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      item ? api.put(`/scheduled/${item.id}`, body) : api.post('/scheduled', body),
    item ? 'Ocurrencia actualizada' : 'Guardado en Recurrentes',
  );
  const remove = useCrudMutation(() => api.del(`/scheduled/${item!.id}`), 'Eliminado');
  const onError = (err: ApiError) =>
    setFields(toFormErrors(err, ['name', 'amount', 'dueDate', 'categoryId', 'accountId', 'creditCardId']));
  const categoryOptions = (categories.data ?? []).filter(
    (c) => c.kind === kind && (c.isActive || c.id === item?.category?.id) && !c.isSystem,
  );
  const options = sourceOptions(accounts.data ?? [], cards.data ?? [], kind, source);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!amount) next.amount = 'Escribe el valor';
    if (!categoryId) next.categoryId = 'Elige una categoría';
    if (!source) next.accountId = 'Elige la cuenta o tarjeta';
    setFields(next);
    if (Object.keys(next).length > 0) return;
    save.mutate(
      {
        ...(item ? {} : { kind }),
        name,
        amount,
        dueDate,
        categoryId,
        ...sourceBody(source),
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
      {!item && (
        <Chips
          ariaLabel="Tipo"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setCategoryId('');
            setSource('');
          }}
          options={[
            { value: 'EXPENSE', label: 'Pago (obligación)' },
            { value: 'INCOME', label: 'Ingreso esperado' },
          ]}
        />
      )}
      <Field label="Nombre" htmlFor="sch-name" error={fields.name}>
        <TextInput id="sch-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Valor" htmlFor="sch-amount" error={fields.amount}>
        <MoneyInput id="sch-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field label="Fecha" htmlFor="sch-date" error={fields.dueDate}>
        <TextInput
          id="sch-date"
          type="date"
          value={dueDate}
          onChange={(e) => e.target.value && setDueDate(e.target.value)}
        />
      </Field>
      <Field label="Categoría" htmlFor="sch-category" error={fields.categoryId}>
        <Select id="sch-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Elige una categoría</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={kind === 'INCOME' ? 'Cuenta donde llega' : 'Cuenta o tarjeta'}
        htmlFor="sch-source"
        error={fields.accountId ?? fields.creditCardId}
      >
        <Select id="sch-source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Elige una opción</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      {fields._ && (
        <p role="alert" className="text-sm text-negative">
          {fields._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar
      </Button>
      {item && !item.recurringRuleId && (
        <ConfirmButton
          size="lg"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
        >
          Eliminar
        </ConfirmButton>
      )}
    </form>
  );
}
```

- [ ] **Step 6: Reglas recurrentes**

Create `apps/web/src/features/recurring/RuleFormSheet.tsx`:

```tsx
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  type Frequency,
  type RecurringRuleDTO,
  type ScheduledKind,
} from '@finanzas/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chips } from '../../components/ui/Chips';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useAccounts, useCards, useCategories } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { sourceBody, sourceOptions, sourceValue } from './sources';

const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

export function RuleFormSheet({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rule?: RecurringRuleDTO;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={rule ? 'Editar regla' : 'Nueva regla recurrente'}>
      {open && <RuleForm rule={rule} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function RuleForm({ rule, onDone }: { rule?: RecurringRuleDTO; onDone: () => void }) {
  const today = useToday();
  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories();
  const [kind, setKind] = useState<ScheduledKind>(rule?.kind ?? 'EXPENSE');
  const [name, setName] = useState(rule?.name ?? '');
  const [amount, setAmount] = useState<number | null>(rule?.amount ?? null);
  const [categoryId, setCategoryId] = useState(rule?.category.id ?? '');
  const [source, setSource] = useState(rule ? sourceValue(rule.account, rule.creditCard) : '');
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'MONTHLY');
  const [intervalDays, setIntervalDays] = useState(String(rule?.intervalDays ?? 30));
  const [day1, setDay1] = useState(String(rule?.day1 ?? 15));
  const [day2, setDay2] = useState(String(rule?.day2 ?? 31));
  const [startDate, setStartDate] = useState(rule?.startDate ?? today);
  const [endDate, setEndDate] = useState(rule?.endDate ?? '');
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useCrudMutation(
    (body: Record<string, unknown>) =>
      rule ? api.put(`/recurring/${rule.id}`, body) : api.post('/recurring', body),
    rule ? 'Regla actualizada' : 'Regla creada',
  );
  const remove = useCrudMutation(() => api.del(`/recurring/${rule!.id}`), 'Regla eliminada');
  const onError = (err: ApiError) =>
    setFields(
      toFormErrors(err, [
        'name',
        'amount',
        'categoryId',
        'accountId',
        'creditCardId',
        'intervalDays',
        'day2',
        'endDate',
      ]),
    );
  const categoryOptions = (categories.data ?? []).filter(
    (c) => c.kind === kind && (c.isActive || c.id === rule?.category.id) && !c.isSystem,
  );
  const options = sourceOptions(accounts.data ?? [], cards.data ?? [], kind, source);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Escribe un nombre';
    if (!amount) next.amount = 'Escribe el valor';
    if (!categoryId) next.categoryId = 'Elige una categoría';
    if (!source) next.accountId = 'Elige la cuenta o tarjeta';
    setFields(next);
    if (Object.keys(next).length > 0) return;
    save.mutate(
      {
        name,
        kind,
        amount,
        categoryId,
        ...sourceBody(source),
        frequency,
        intervalDays: frequency === 'CUSTOM_DAYS' ? Number(intervalDays) : null,
        day1: frequency === 'SEMIMONTHLY' ? Number(day1) : null,
        day2: frequency === 'SEMIMONTHLY' ? Number(day2) : null,
        startDate,
        endDate: endDate || null,
        ...(rule ? { isActive } : {}),
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
      <Chips
        ariaLabel="Tipo"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setCategoryId('');
          setSource('');
        }}
        options={[
          { value: 'EXPENSE', label: 'Gasto' },
          { value: 'INCOME', label: 'Ingreso' },
        ]}
      />
      <Field label="Nombre" htmlFor="rule-name" error={fields.name}>
        <TextInput
          id="rule-name"
          maxLength={60}
          placeholder="Arriendo, Netflix, Salario…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Valor" htmlFor="rule-amount" error={fields.amount}>
        <MoneyInput id="rule-amount" value={amount} onChange={setAmount} />
      </Field>
      <Field label="Categoría" htmlFor="rule-category" error={fields.categoryId}>
        <Select id="rule-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Elige una categoría</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Cuenta o tarjeta"
        htmlFor="rule-source"
        error={fields.accountId ?? fields.creditCardId}
        hint={
          kind === 'EXPENSE'
            ? 'Para pagar tarjetas o préstamos no hace falta una regla: sus vencimientos se calculan solos.'
            : undefined
        }
      >
        <Select id="rule-source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Elige una opción</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Frecuencia" htmlFor="rule-frequency">
        <Select
          id="rule-frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </Select>
      </Field>
      {frequency === 'CUSTOM_DAYS' && (
        <Field label="Cada cuántos días" htmlFor="rule-interval" error={fields.intervalDays}>
          <TextInput
            id="rule-interval"
            inputMode="numeric"
            value={intervalDays}
            onChange={(e) => setIntervalDays(digits(e.target.value, 3))}
          />
        </Field>
      )}
      {frequency === 'SEMIMONTHLY' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Primer día" htmlFor="rule-day1">
            <TextInput
              id="rule-day1"
              inputMode="numeric"
              value={day1}
              onChange={(e) => setDay1(digits(e.target.value, 2))}
            />
          </Field>
          <Field label="Segundo día" htmlFor="rule-day2" error={fields.day2} hint="31 = último día del mes.">
            <TextInput
              id="rule-day2"
              inputMode="numeric"
              value={day2}
              onChange={(e) => setDay2(digits(e.target.value, 2))}
            />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Desde" htmlFor="rule-start">
          <TextInput
            id="rule-start"
            type="date"
            value={startDate}
            onChange={(e) => e.target.value && setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Hasta (opcional)" htmlFor="rule-end" error={fields.endDate}>
          <TextInput
            id="rule-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>
      {rule && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Activa (si la pausas, no genera nuevas ocurrencias)
        </label>
      )}
      {fields._ && (
        <p role="alert" className="text-sm text-negative">
          {fields._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar regla
      </Button>
      {rule && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar regla
          </ConfirmButton>
          <p className="text-xs text-muted">
            Las ocurrencias ya pagadas u omitidas se conservan en el historial.
          </p>
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 7: Página**

Create `apps/web/src/features/recurring/RecurringPage.tsx`:

```tsx
import {
  addDays,
  FREQUENCY_LABELS,
  type RecurringRuleDTO,
  type ScheduledItemDTO,
} from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { CardTitle } from '../../components/ui/Card';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatShortDate } from '../../lib/format';
import { useRules, useScheduled } from '../../lib/queries';
import { refName } from '../../lib/refs';
import { useCrudMutation } from '../../lib/useCrud';
import { useToday } from '../auth/useAuth';
import { useQuickAdd } from '../quick-add/QuickAddContext';
import { CompleteSheet } from './CompleteSheet';
import { RuleFormSheet } from './RuleFormSheet';
import { ScheduledFormSheet } from './ScheduledFormSheet';

export function RecurringPage() {
  const today = useToday();
  const toast = useToast();
  const upcoming = useScheduled(`to=${addDays(today, 30)}`);
  const rules = useRules();
  const { open } = useQuickAdd();
  const [ruleForm, setRuleForm] = useState<{ open: boolean; rule?: RecurringRuleDTO }>({ open: false });
  const [itemForm, setItemForm] = useState<{ open: boolean; item?: ScheduledItemDTO }>({ open: false });
  const [completing, setCompleting] = useState<ScheduledItemDTO | null>(null);
  const showError = { onError: (err: Error) => toast.show({ message: err.message, tone: 'error' as const }) };
  const skip = useCrudMutation((id: string) => api.post(`/scheduled/${id}/skip`), 'Omitido');
  const remove = useCrudMutation((id: string) => api.del(`/scheduled/${id}`), 'Eliminado');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Recurrentes y obligaciones</h1>
      <div className="grid grid-cols-2 gap-2">
        <Button aria-label="Nueva regla" onClick={() => setRuleForm({ open: true })}>
          <Plus size={16} /> Regla
        </Button>
        <Button variant="secondary" aria-label="Nuevo pago único" onClick={() => setItemForm({ open: true })}>
          <Plus size={16} /> Pago único
        </Button>
      </div>

      <section>
        <CardTitle className="mb-2 px-1">Próximos 30 días</CardTitle>
        {upcoming.isPending ? (
          <PageSpinner />
        ) : upcoming.isError ? (
          <ErrorState error={upcoming.error} onRetry={() => void upcoming.refetch()} />
        ) : upcoming.data.length === 0 ? (
          <EmptyState title="Nada pendiente en los próximos 30 días" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {upcoming.data.map((item) => (
              <UpcomingRow
                key={item.id}
                item={item}
                today={today}
                onComplete={() => setCompleting(item)}
                onSkip={() => skip.mutate(item.id, showError)}
                onEdit={() => setItemForm({ open: true, item })}
                onDelete={() => remove.mutate(item.id, showError)}
                onPayDerived={() =>
                  item.derived === 'CARD'
                    ? open({ kind: 'card-payment', cardId: item.sourceId ?? undefined })
                    : open({ kind: 'loan-payment', debtId: item.sourceId ?? undefined })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <CardTitle className="mb-2 px-1">Reglas</CardTitle>
        {rules.isPending ? (
          <PageSpinner />
        ) : rules.isError ? (
          <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
        ) : rules.data.length === 0 ? (
          <EmptyState
            title="Sin reglas todavía"
            description="Crea reglas para el arriendo, los servicios, las suscripciones o tu salario."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            {rules.data.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setRuleForm({ open: true, rule: r })}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-medium', !r.isActive && 'text-muted')}>
                      {r.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {FREQUENCY_LABELS[r.frequency]} ·{' '}
                      {r.isActive
                        ? r.nextDate
                          ? `próxima ${formatShortDate(r.nextDate)}`
                          : 'terminada'
                        : 'pausada'}
                    </span>
                  </span>
                  <Amount
                    value={r.amount}
                    tone={r.kind === 'INCOME' ? 'income' : 'neutral'}
                    className="font-semibold"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 px-1 text-xs text-muted">
          Los pagos de tarjetas y las cuotas de préstamos se calculan solos: no crees reglas para ellos.
        </p>
      </section>

      <RuleFormSheet
        open={ruleForm.open}
        onOpenChange={(o) => setRuleForm((f) => ({ ...f, open: o }))}
        rule={ruleForm.rule}
      />
      <ScheduledFormSheet
        open={itemForm.open}
        onOpenChange={(o) => setItemForm((f) => ({ ...f, open: o }))}
        item={itemForm.item}
      />
      <CompleteSheet item={completing} onClose={() => setCompleting(null)} />
    </div>
  );
}

function UpcomingRow({
  item,
  today,
  onComplete,
  onSkip,
  onEdit,
  onDelete,
  onPayDerived,
}: {
  item: ScheduledItemDTO;
  today: string;
  onComplete: () => void;
  onSkip: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPayDerived: () => void;
}) {
  const overdue = item.dueDate < today;
  const income = item.kind === 'INCOME';
  const source = refName(item.creditCard) ?? refName(item.account);
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.name}</p>
          <p className={cn('text-xs', overdue ? 'font-medium text-negative' : 'text-muted')}>
            {overdue ? `Vencida el ${formatShortDate(item.dueDate)}` : `Vence ${formatShortDate(item.dueDate)}`}
            {source ? ` · ${source}` : ''}
          </p>
        </div>
        <Amount value={item.amount} tone={income ? 'income' : 'neutral'} className="font-semibold" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {item.derived ? (
          <>
            <Button size="sm" aria-label={`Pagar ${item.name}`} onClick={onPayDerived}>
              Pagar
            </Button>
            <Link
              to={item.derived === 'CARD' ? `/cards/${item.sourceId}` : '/debts'}
              className="inline-flex min-h-11 items-center px-2 text-sm text-primary"
            >
              {item.derived === 'CARD' ? 'Ver tarjeta' : 'Ver préstamo'}
            </Link>
          </>
        ) : (
          <>
            <Button size="sm" aria-label={`${income ? 'Recibir' : 'Pagar'} ${item.name}`} onClick={onComplete}>
              {income ? 'Recibir' : 'Pagar'}
            </Button>
            <Button size="sm" variant="secondary" aria-label={`Omitir ${item.name}`} onClick={onSkip}>
              Omitir
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Editar ${item.name}`} onClick={onEdit}>
              Editar
            </Button>
            {!item.recurringRuleId && (
              <ConfirmButton size="sm" onConfirm={onDelete}>
                Eliminar
              </ConfirmButton>
            )}
          </>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 8: Ruta y navegación**

En `apps/web/src/app/router.tsx`, agregar:

```tsx
  {
    path: '/recurring',
    lazy: page(
      () => import('../features/recurring/RecurringPage'),
      (m) => m.RecurringPage,
    ),
  },
```

En `apps/web/src/app/navigation.ts`, importar `Repeat` e insertar después de "Metas":

```ts
  { to: '/recurring', label: 'Recurrentes y obligaciones', icon: Repeat },
```

- [ ] **Step 9: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): recurrentes y obligaciones con pagar, omitir y reglas"
```

---

### Task 11: Alertas

**Files:**
- Create: `apps/web/src/features/alerts/AlertItem.tsx`, `AlertsPage.tsx`, `AlertsPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`, `apps/web/src/app/navigation.ts`

**Interfaces:**
- Consumes: `GET /api/alerts` (`{ items, status }`), `POST /api/alerts/:key/dismiss`, `DELETE /api/alerts/dismissed` (plan 2A Task 14); `useAlerts`.
- Produces:
  - `AlertItem({ alert, onDismiss?, dismissing? })` y `StatusSummary({ status })` (los usa también el dashboard).
  - Ruta `/alerts` ("Alertas" en Más, después de "Categorías"): estado general, lista con "Ver" y "Descartar", y "Mostrar las alertas descartadas".

- [ ] **Step 1: Escribir el test**

Create `apps/web/src/features/alerts/AlertsPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { AlertsPage } from './AlertsPage';

afterEach(() => vi.unstubAllGlobals());

const alerts = {
  status: { level: 'WARNING', title: 'Cuidado', message: 'Has utilizado el 78 % de tu presupuesto y quedan 12 días.' },
  items: [
    {
      key: 'obligation-overdue:s1:2026-10-05',
      level: 'DANGER',
      title: 'Arriendo está vencida',
      message: 'Vencía el 05 oct: $1.000.000.',
      href: '/recurring',
    },
    {
      key: 'low-balance:2026-10-20',
      level: 'WARNING',
      title: 'Tu dinero disponible está bajo',
      message: 'Disponible estimado: $50.000.',
      href: null,
    },
  ],
};

describe('AlertsPage (spec 8.12)', () => {
  it('shows the status and dismisses or restores alerts', async () => {
    const calls: string[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /alerts': () => ({ status: 200, body: alerts }),
      'POST /alerts/low-balance:2026-10-20/dismiss': () => {
        calls.push('dismiss');
        return { status: 204 };
      },
      'DELETE /alerts/dismissed': () => {
        calls.push('restore');
        return { status: 204 };
      },
    });
    renderWithProviders(<AlertsPage />);
    expect(await screen.findByText('Cuidado')).toBeInTheDocument();
    expect(screen.getByText('Arriendo está vencida')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/recurring');
    await userEvent.click(screen.getByRole('button', { name: 'Descartar: Tu dinero disponible está bajo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar las alertas descartadas' }));
    await waitFor(() => expect(calls).toEqual(['dismiss', 'restore']));
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -w @finanzas/web -- src/features/alerts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Componentes y página**

Create `apps/web/src/features/alerts/AlertItem.tsx`:

```tsx
import type { AlertDTO, AlertLevel, StatusDTO } from '@finanzas/shared';
import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';

const LEVELS: Record<AlertLevel, { icon: LucideIcon; className: string; label: string }> = {
  DANGER: { icon: OctagonAlert, className: 'text-negative', label: 'Urgente' },
  WARNING: { icon: TriangleAlert, className: 'text-warning', label: 'Atención' },
  INFO: { icon: Info, className: 'text-primary', label: 'Información' },
};

export function AlertItem({
  alert,
  onDismiss,
  dismissing,
}: {
  alert: AlertDTO;
  onDismiss?: () => void;
  dismissing?: boolean;
}) {
  const level = LEVELS[alert.level];
  const IconComponent = level.icon;
  return (
    <li className="flex gap-3 rounded-xl bg-surface-2 p-3">
      <IconComponent size={20} className={cn('mt-0.5 shrink-0', level.className)} aria-label={level.label} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{alert.title}</p>
        <p className="text-xs text-muted">{alert.message}</p>
        {(alert.href || onDismiss) && (
          <div className="flex flex-wrap gap-x-4">
            {alert.href && (
              <Link to={alert.href} className="inline-flex min-h-11 items-center text-sm text-primary">
                Ver
              </Link>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                disabled={dismissing}
                aria-label={`Descartar: ${alert.title}`}
                className="inline-flex min-h-11 items-center text-sm text-muted disabled:opacity-50"
              >
                Descartar
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

const STATUS_DOT: Record<StatusDTO['level'], string> = {
  OK: 'bg-positive',
  WARNING: 'bg-warning',
  DANGER: 'bg-negative',
};
const STATUS_LABEL: Record<StatusDTO['level'], string> = {
  OK: 'Estado verde',
  WARNING: 'Estado amarillo',
  DANGER: 'Estado rojo',
};

/** Spec 8.12: 🟢 "Vas bien" · 🟡 "Cuidado" · 🔴 "Debes controlar tus gastos". */
export function StatusSummary({ status }: { status: StatusDTO }) {
  return (
    <div className="flex items-start gap-3">
      <span
        role="img"
        aria-label={STATUS_LABEL[status.level]}
        className={cn('mt-1.5 size-3 shrink-0 rounded-full', STATUS_DOT[status.level])}
      />
      <div>
        <p className="font-semibold">{status.title}</p>
        <p className="text-sm text-muted">{status.message}</p>
      </div>
    </div>
  );
}
```

Create `apps/web/src/features/alerts/AlertsPage.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { qk, useAlerts } from '../../lib/queries';
import { useCrudMutation } from '../../lib/useCrud';
import { AlertItem, StatusSummary } from './AlertItem';

export function AlertsPage() {
  const alerts = useAlerts();
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: (key: string) => api.post(`/alerts/${key}/dismiss`),
    onSuccess: () =>
      Promise.all(
        [qk.alerts, qk.dashboard].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
  const restore = useCrudMutation(
    () => api.del('/alerts/dismissed'),
    'Volvimos a mostrar las alertas descartadas',
  );
  if (alerts.isPending) return <PageSpinner />;
  if (alerts.isError) return <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Alertas</h1>
      <Card>
        <StatusSummary status={alerts.data.status} />
      </Card>
      {alerts.data.items.length === 0 ? (
        <EmptyState title="Todo en orden" description="No tienes alertas por ahora." />
      ) : (
        <ul className="space-y-2">
          {alerts.data.items.map((a) => (
            <AlertItem
              key={a.key}
              alert={a}
              dismissing={dismiss.isPending && dismiss.variables === a.key}
              onDismiss={() => dismiss.mutate(a.key)}
            />
          ))}
        </ul>
      )}
      <Button variant="ghost" loading={restore.isPending} onClick={() => restore.mutate()}>
        Mostrar las alertas descartadas
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Ruta y navegación**

En `apps/web/src/app/router.tsx`, agregar:

```tsx
  {
    path: '/alerts',
    lazy: page(
      () => import('../features/alerts/AlertsPage'),
      (m) => m.AlertsPage,
    ),
  },
```

En `apps/web/src/app/navigation.ts`, importar `Bell` e insertar después de "Categorías":

```ts
  { to: '/alerts', label: 'Alertas', icon: Bell },
```

`SECONDARY_NAV` queda: Mis cuentas, Tarjetas, Préstamos, Metas, Recurrentes y obligaciones, Categorías, Alertas, Configuración, Perfil y seguridad (addendum §7).

- [ ] **Step 5: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): alertas con estado general, descartar y volver a mostrar"
```

---

### Task 12: Dashboard completo

**Files:**
- Create: `apps/web/src/features/dashboard/SpendingPowerCard.tsx`, `SpendingPowerSheet.tsx`, `StatusCard.tsx`, `GoalsSection.tsx`
- Modify: `apps/web/src/features/dashboard/MonthCard.tsx`, `DashboardPage.tsx`, `DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `DashboardDTO.spendingPower`, `.status`, `.alerts`, `.goals`, `.budget` (plan 2A Task 14); `AlertItem`, `StatusSummary` (Task 11); `ProgressBar`.
- Produces: dashboard en el orden del addendum §6.9: saludo → **¿Cuánto puedo gastar hoy?** (con "¿Cómo se calcula?") → dinero total → estado y alertas → este mes (con uso del presupuesto) → cuentas → tarjetas → préstamos → metas.

- [ ] **Step 1: Escribir los tests**

En `apps/web/src/features/dashboard/DashboardPage.test.tsx`, agregar dentro del `describe('DashboardPage', …)`:

```tsx
  it('shows how much I can spend today and explains it', async () => {
    renderDashboard({
      ...base,
      money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 2_500_000)] },
      spendingPower: {
        daily: 45_400,
        spentToday: 20_000,
        remainingToday: 25_400,
        limitedBy: 'BUDGET',
        reason: null,
        breakdown: {
          liquidity: {
            daily: 60_000,
            bindingDate: '2026-10-24',
            days: 5,
            items: [
              { key: 'liquid', label: 'Dinero líquido', amount: 300_000 },
              { key: 'obligations', label: 'Obligaciones pendientes', amount: 0 },
            ],
          },
          budget: {
            daily: 45_400,
            days: 12,
            items: [{ key: 'budget', label: 'Presupuesto del mes', amount: 2_000_000 }],
          },
        },
      },
    });
    expect(await screen.findByText('¿Cuánto puedo gastar hoy?')).toBeInTheDocument();
    expect(screen.getByText('$45.400')).toBeInTheDocument();
    expect(screen.getByText('Te quedan hoy')).toBeInTheDocument();
    expect(screen.getByText('$25.400')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /¿Cómo se calcula\?/ }));
    expect(await screen.findByText('Hasta el 24 oct (5 días): $60.000 por día')).toBeInTheDocument();
    expect(screen.getByText('Presupuesto del mes')).toBeInTheDocument();
    expect(screen.queryByText('Obligaciones pendientes')).not.toBeInTheDocument();
    expect(screen.getByText(/Se usa el menor/)).toBeInTheDocument();
  });

  it('says when today was overspent or there is no margin', async () => {
    renderDashboard({
      ...base,
      money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 100_000)] },
      spendingPower: {
        ...base.spendingPower,
        daily: 0,
        spentToday: 5_000,
        remainingToday: -5_000,
        reason: 'Tus obligaciones pendientes del mes no dejan margen.',
      },
    });
    expect(await screen.findByText('Hoy te pasaste')).toBeInTheDocument();
    expect(
      screen.getByText('Hoy no tienes margen. Tus obligaciones pendientes del mes no dejan margen.'),
    ).toBeInTheDocument();
  });

  it('shows the status with the main alerts, the budget and the goals', async () => {
    renderDashboard({
      ...base,
      money: { ...base.money, accounts: [account('a1', 'Bancolombia', 'BANK', 2_500_000)] },
      status: { level: 'WARNING', title: 'Cuidado', message: 'Has utilizado el 78 % de tu presupuesto.' },
      alerts: [
        {
          key: 'budget:2026-10:total:75',
          level: 'WARNING',
          title: 'Llevas el 78 % del presupuesto',
          message: 'Has gastado $1.560.000 de $2.000.000.',
          href: '/budgets',
        },
      ],
      budget: { budget: 2_000_000, spent: 1_560_000, usage: 0.78, projectionExceedsOnDay: 26 },
      goals: [
        {
          id: 'g1',
          name: 'Comprar computador',
          targetAmount: 5_000_000,
          targetDate: '2027-06-30',
          account: { id: 'a2', name: 'Ahorro', icon: 'piggy-bank', color: '#0ea5e9', isActive: true, type: 'SAVINGS' },
          initialAmount: 1_000_000,
          status: 'ACTIVE',
          icon: 'laptop',
          color: '#0ea5e9',
          contributed: 400_000,
          withdrawn: 0,
          progress: 1_400_000,
          pct: 0.28,
          remaining: 3_600_000,
          monthlyNeeded: 450_000,
          weeklyNeeded: 94_737,
        },
      ],
    });
    expect(await screen.findByText('Cuidado')).toBeInTheDocument();
    expect(screen.getByText('Llevas el 78 % del presupuesto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todas las alertas' })).toHaveAttribute('href', '/alerts');
    expect(screen.getByRole('progressbar', { name: 'Uso del presupuesto' })).toHaveAttribute(
      'aria-valuenow',
      '78',
    );
    expect(screen.getByText('A este ritmo superarías el presupuesto el día 26.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance de Comprar computador' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/features/dashboard`
Expected: FAIL (componentes inexistentes).

- [ ] **Step 3: ¿Cuánto puedo gastar hoy?**

Create `apps/web/src/features/dashboard/SpendingPowerSheet.tsx`:

```tsx
import type { BreakdownItem, SpendingPowerDTO } from '@finanzas/shared';
import { Amount } from '../../components/ui/Amount';
import { Sheet } from '../../components/ui/Sheet';
import { formatCOP, formatShortDate } from '../../lib/format';

function Items({ items }: { items: BreakdownItem[] }) {
  return (
    <ul className="divide-y divide-border">
      {items
        .filter((i) => i.amount !== 0)
        .map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{i.label}</span>
            <Amount value={i.amount} tone={i.amount < 0 ? 'expense' : 'neutral'} className="font-medium" />
          </li>
        ))}
    </ul>
  );
}

/** Spec 8.7: desglose del límite por liquidez y, si hay presupuesto, del límite por presupuesto. */
export function SpendingPowerSheet({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: SpendingPowerDTO;
}) {
  const { liquidity, budget } = data.breakdown;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="¿Cómo se calcula?"
      description="Lo que puedes gastar hoy sin quedarte corto para lo que viene este mes."
    >
      <div className="space-y-4">
        <section>
          <h3 className="text-sm font-semibold">Según tu dinero y tus próximos pagos</h3>
          <Items items={liquidity.items} />
          <p className="mt-1 text-sm text-muted">
            Hasta el {formatShortDate(liquidity.bindingDate)} ({liquidity.days}{' '}
            {liquidity.days === 1 ? 'día' : 'días'}): {formatCOP(liquidity.daily)} por día
          </p>
        </section>
        {budget && (
          <section>
            <h3 className="text-sm font-semibold">Según tu presupuesto</h3>
            <Items items={budget.items} />
            <p className="mt-1 text-sm text-muted">
              {budget.days} {budget.days === 1 ? 'día' : 'días'} restantes:{' '}
              {formatCOP(budget.daily)} por día
            </p>
          </section>
        )}
        <p className="rounded-xl bg-surface-2 p-3 text-sm">
          Se usa el menor: <strong>{formatCOP(data.daily)}</strong> por día. Lo que gastes hoy no
          cambia esta cifra; se descuenta de "Te quedan hoy".
        </p>
        <p className="text-xs text-muted">
          Es una estimación basada en tus datos, no asesoría financiera.
        </p>
      </div>
    </Sheet>
  );
}
```

Create `apps/web/src/features/dashboard/SpendingPowerCard.tsx`:

```tsx
import type { SpendingPowerDTO } from '@finanzas/shared';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Amount } from '../../components/ui/Amount';
import { Card } from '../../components/ui/Card';
import { SpendingPowerSheet } from './SpendingPowerSheet';

export function SpendingPowerCard({ data }: { data: SpendingPowerDTO }) {
  const [open, setOpen] = useState(false);
  const over = data.remainingToday < 0;
  return (
    <Card>
      <p className="text-sm text-muted">¿Cuánto puedo gastar hoy?</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight">
        <Amount value={data.daily} />
      </p>
      {data.daily === 0 && data.reason && (
        <p className="mt-1 text-sm text-negative">Hoy no tienes margen. {data.reason}</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2 p-3">
          <span className="text-xs text-muted">Gastado hoy</span>
          <Amount value={data.spentToday} className="mt-1 block font-semibold" />
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <span className="text-xs text-muted">{over ? 'Hoy te pasaste' : 'Te quedan hoy'}</span>
          <Amount
            value={Math.abs(data.remainingToday)}
            tone={over ? 'debt' : 'neutral'}
            className="mt-1 block font-semibold"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm text-primary"
      >
        ¿Cómo se calcula? <ChevronRight size={16} aria-hidden />
      </button>
      <SpendingPowerSheet open={open} onOpenChange={setOpen} data={data} />
    </Card>
  );
}
```

- [ ] **Step 4: Estado, metas y presupuesto del mes**

Create `apps/web/src/features/dashboard/StatusCard.tsx`:

```tsx
import type { AlertDTO, StatusDTO } from '@finanzas/shared';
import { Link } from 'react-router';
import { Card } from '../../components/ui/Card';
import { AlertItem, StatusSummary } from '../alerts/AlertItem';

export function StatusCard({ status, alerts }: { status: StatusDTO; alerts: AlertDTO[] }) {
  return (
    <Card>
      <StatusSummary status={status} />
      {alerts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {alerts.map((a) => (
            <AlertItem key={a.key} alert={a} />
          ))}
        </ul>
      )}
      <Link to="/alerts" className="mt-2 inline-flex min-h-11 items-center text-sm text-primary">
        Ver todas las alertas
      </Link>
    </Card>
  );
}
```

Create `apps/web/src/features/dashboard/GoalsSection.tsx`:

```tsx
import type { GoalDTO } from '@finanzas/shared';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Card, CardTitle } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatPercent } from '../../lib/format';

export function GoalsSection({ goals }: { goals: GoalDTO[] }) {
  if (goals.length === 0) return null;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Metas</CardTitle>
        <Link to="/goals" className="text-sm text-primary">
          Ver metas
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {goals.map((g) => (
          <li key={g.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{g.name}</span>
              <span className="shrink-0 text-muted">
                <Amount value={g.progress} tone="balance" /> · {formatPercent(g.pct)}
              </span>
            </div>
            <ProgressBar value={g.pct} label={`Avance de ${g.name}`} tone="positive" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

En `apps/web/src/features/dashboard/MonthCard.tsx`:

1. Cambiar la firma e imports:

```tsx
import type { DashboardBudgetDTO, DashboardDTO } from '@finanzas/shared';
import { Link } from 'react-router';
import { Amount } from '../../components/ui/Amount';
import { Card, CardTitle } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatPercent } from '../../lib/format';

export function MonthCard({
  data,
  budget,
}: {
  data: DashboardDTO['thisMonth'];
  budget: DashboardBudgetDTO | null;
}) {
```

2. Antes de `</Card>`, agregar:

```tsx
      {budget ? (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm">
            <span>Presupuesto</span>
            <span>
              <Amount value={budget.spent} /> de <Amount value={budget.budget} />
            </span>
          </div>
          <ProgressBar value={budget.usage} label="Uso del presupuesto" />
          {budget.projectionExceedsOnDay && (
            <p className="text-sm text-warning">
              A este ritmo superarías el presupuesto el día {budget.projectionExceedsOnDay}.
            </p>
          )}
        </div>
      ) : (
        <Link to="/budgets" className="mt-2 inline-flex min-h-11 items-center text-sm text-primary">
          Crear un presupuesto para este mes
        </Link>
      )}
```

- [ ] **Step 5: Orden del dashboard**

En `apps/web/src/features/dashboard/DashboardPage.tsx`, importar `SpendingPowerCard`, `StatusCard` y `GoalsSection`, y reemplazar el fragmento del `else` por:

```tsx
        <>
          <SpendingPowerCard data={d.spendingPower} />
          <MoneySummaryCard data={d} />
          <StatusCard status={d.status} alerts={d.alerts} />
          <MonthCard data={d.thisMonth} budget={d.budget} />
          <AccountsCard accounts={d.money.accounts} total={d.money.total} />
          <CardsSection cards={d.cards} />
          <LoansSection loans={d.loans} />
          <GoalsSection goals={d.goals} />
        </>
```

- [ ] **Step 6: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS (los tests anteriores del dashboard siguen pasando: el `base` ya trae los campos nuevos desde la Task 14 del plan 2A).

```bash
git add -A && git commit -m "feat(web): dashboard con cuánto puedo gastar hoy, estado, alertas, presupuesto y metas"
```

---

### Task 13: Perfil — cambiar email y eliminar mi cuenta

**Files:**
- Create: `apps/web/src/features/profile/EmailCard.tsx`, `apps/web/src/features/profile/DeleteAccountCard.tsx`
- Modify: `apps/web/src/features/profile/ProfilePage.tsx`, `apps/web/src/features/profile/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: `PATCH /api/me { email, currentPassword }`, `DELETE /api/me { password, confirmation: 'ELIMINAR' }` (plan 2A Task 15); `api.del` con cuerpo (Task 2); `confirmTwice` (Task 3).
- Produces: tarjetas "Email" y "Eliminar mi cuenta" en el perfil.

- [ ] **Step 1: Escribir los tests**

En `apps/web/src/features/profile/ProfilePage.test.tsx`, agregar los imports `beforeEach` y `confirmTwice`, y:

```tsx
describe('ProfilePage — account', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('changes the email with the current password', async () => {
    const patches: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'PATCH /me': (body) => {
        patches.push(body);
        return { status: 200, body: { user: { ...demoUser, email: 'nuevo@correo.co' } } };
      },
    });
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText('Nuevo email'), 'nuevo@correo.co');
    await userEvent.type(screen.getByLabelText('Contraseña actual para confirmar'), 'clave-segura-123');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar email' }));
    await waitFor(() =>
      expect(patches).toEqual([{ email: 'nuevo@correo.co', currentPassword: 'clave-segura-123' }]),
    );
  });

  it('deletes the account only after typing ELIMINAR', async () => {
    const deletes: unknown[] = [];
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'DELETE /me': (body) => {
        deletes.push(body);
        return { status: 204 };
      },
    });
    renderWithProviders(<ProfilePage />);
    const button = await screen.findByRole('button', { name: 'Eliminar mi cuenta y mis datos' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Tu contraseña'), 'clave-segura-123');
    await userEvent.type(screen.getByLabelText('Escribe ELIMINAR para confirmar'), 'ELIMINAR');
    expect(button).toBeEnabled();
    await confirmTwice('Eliminar mi cuenta y mis datos');
    await waitFor(() =>
      expect(deletes).toEqual([{ password: 'clave-segura-123', confirmation: 'ELIMINAR' }]),
    );
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w @finanzas/web -- src/features/profile`
Expected: FAIL.

- [ ] **Step 3: Componentes**

Create `apps/web/src/features/profile/EmailCard.tsx`:

```tsx
import type { UserDTO } from '@finanzas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle } from '../../components/ui/Card';
import { Field, TextInput } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { qk } from '../../lib/queries';

export function EmailCard({ user }: { user: UserDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      api.patch<{ user: UserDTO }>('/me', { email, currentPassword: password }),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(qk.me, updated);
      setEmail('');
      setPassword('');
      setFields({});
      toast.show({ message: 'Email actualizado' });
    },
    onError: (err) =>
      setFields(
        err instanceof ApiError
          ? toFormErrors(err, ['email', 'currentPassword'])
          : { _: 'No se pudo cambiar el email' },
      ),
  });
  return (
    <Card>
      <CardTitle>Email</CardTitle>
      <p className="mt-1 text-sm text-muted">Actual: {user.email}</p>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Nuevo email" htmlFor="new-email" error={fields.email}>
          <TextInput
            id="new-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="Contraseña actual para confirmar"
          htmlFor="email-password"
          error={fields.currentPassword}
        >
          <TextInput
            id="email-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {fields._ && (
          <p role="alert" className="text-sm text-negative">
            {fields._}
          </p>
        )}
        <Button type="submit" loading={save.isPending} disabled={!email.trim() || !password}>
          Cambiar email
        </Button>
      </form>
    </Card>
  );
}
```

Create `apps/web/src/features/profile/DeleteAccountCard.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardTitle } from '../../components/ui/Card';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, TextInput } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError } from '../../lib/api';

/** Addendum §3.5: irreversible; exige la contraseña y escribir ELIMINAR. */
export function DeleteAccountCard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => api.del('/me', { password, confirmation }),
    onSuccess: () => {
      queryClient.clear();
      toast.show({ message: 'Eliminamos tu cuenta y todos tus datos.' });
      navigate('/login', { replace: true });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? (err.fields?.password ?? err.message)
          : 'No se pudo eliminar la cuenta',
      ),
  });
  return (
    <Card className="ring-negative/40">
      <CardTitle className="text-negative">Eliminar mi cuenta</CardTitle>
      <p className="mt-1 text-sm text-muted">
        Borra tu usuario y todos tus datos: cuentas, movimientos, presupuestos, metas y recurrentes.
        No se puede deshacer.
      </p>
      <div className="mt-3 space-y-3">
        <Field label="Tu contraseña" htmlFor="delete-password">
          <TextInput
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Escribe ELIMINAR para confirmar" htmlFor="delete-confirmation">
          <TextInput
            id="delete-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        <ConfirmButton
          size="lg"
          disabled={!password || confirmation !== 'ELIMINAR'}
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        >
          Eliminar mi cuenta y mis datos
        </ConfirmButton>
      </div>
    </Card>
  );
}
```

En `apps/web/src/features/profile/ProfilePage.tsx`:

1. Importar `EmailCard` y `DeleteAccountCard`.
2. Borrar la línea `<p className="text-sm text-muted">Email: {user.email}</p>` de la tarjeta "Tus datos".
3. Renderizar `<EmailCard user={user} />` después de la tarjeta "Tus datos" y `<DeleteAccountCard />` al final, después del botón "Cerrar sesión".

- [ ] **Step 4: Verificar y commit de trabajo**

Run: `npm test -w @finanzas/web && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): cambiar email y eliminar la cuenta desde el perfil"
```

---

### Task 14: README, verificación final, prueba de humo y commit único de la Fase 2

**Files:**
- Modify: `README.md`
- (sin código nuevo)

**Interfaces:**
- Consumes: todo lo anterior (planes 2A y 2B).
- Produces: documentación actualizada; Fase 2 verificada de punta a punta; un único commit en `main` publicado en `origin`.

- [ ] **Step 1: README**

En `README.md`:

1. Cambiar el título `## Qué hace (Fase 1)` por `## Qué hace`.
2. Antes de la línea que empieza con `- Multiusuario con aislamiento total`, agregar:

```markdown
- **¿Cuánto puedo gastar hoy?**: una cifra diaria que respeta tus próximos pagos (obligaciones, tarjetas y cuotas), el ahorro que te propones y el presupuesto, con su desglose.
- Presupuestos mensuales (general y por categoría) con proyección y alertas al 50, 75, 90 y 100 %; se copian del mes anterior.
- Metas de ahorro en cuentas de ahorro o inversión: abonar y retirar son transferencias, no gastos.
- Recurrentes y obligaciones: reglas semanales, quincenales, mensuales, anuales o cada N días; pagos únicos e ingresos esperados; "Pagar" crea el movimiento real y al registrar un gasto la app pregunta "¿Es el pago de…?".
- Alertas y estado general (vas bien · cuidado · debes controlar tus gastos), con opción de descartarlas.
- Porcentajes objetivo de obligaciones, ahorro, inversión, entretenimiento y otros.
- Todo editable o eliminable: eliminar conserva el historial (sección "Eliminados" con Restaurar); cuentas, tarjetas y préstamos se eliminan con saldo $0; ajuste de saldo; eliminar tu cuenta y todos tus datos.
- Tema oscuro por defecto (claro o según el sistema, en Perfil).
```

3. En la sección `## Base de datos, Prisma y migraciones`, agregar al final de la lista:

```markdown
- La migración `fase2` pone el tema oscuro por defecto y agrega `RecurringRule.activeFrom` y `ScheduledItem.ruleDate` (las ocurrencias de una regla no se duplican aunque se mueva su fecha).
```

- [ ] **Step 2: Verificación completa**

Run (raíz):

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: todo en verde (tests de `shared`, `api` y `web`). Si `format:check` falla, ejecutar `npm run format` y repetir. El build de la web debe mostrar el aviso esperado sobre `theme-init.js` (script sin `type="module"`), no un error.

- [ ] **Step 3: Prueba de humo con Docker**

Si no existe `.env` en la raíz: `cp .env.example .env` y poner `APP_URL=http://localhost:8080` y `POSTGRES_PASSWORD` con un valor aleatorio (borrarlo al terminar si se creó para esta prueba). Luego:

```bash
docker compose -p finanzas-local -f docker-compose.yml -f docker-compose.local.yml up -d --build
docker compose -p finanzas-local ps
curl -s http://localhost:8080/api/health
curl -s http://localhost:8080/theme-init.js | head -n 2
curl -s -c /tmp/fz.txt -H 'content-type: application/json' -H 'origin: http://localhost:8080' \
  -d '{"name":"Prueba","email":"prueba-fase2@example.com","password":"clave-segura-123"}' \
  http://localhost:8080/api/auth/register
curl -s -b /tmp/fz.txt http://localhost:8080/api/dashboard | grep -o '"spendingPower"'
curl -s -b /tmp/fz.txt http://localhost:8080/api/auth/me | grep -o '"theme":"DARK"'
docker compose -p finanzas-local logs api | tail -n 20
```

Expected: `db`, `api` y `web` `healthy`; `{"status":"ok"}`; el comentario de `theme-init.js`; `"spendingPower"` y `"theme":"DARK"`; los logs muestran que `prisma migrate deploy` aplicó `20261008000000_fase2` y no contienen cuerpos, montos ni emails. Abrir http://localhost:8080 en el navegador (y en el celular, a 360 px): iniciar sesión, ver el tema oscuro, registrar un gasto recurrente, abrir Presupuestos, Metas, Recurrentes y Alertas.

```bash
docker compose -p finanzas-local -f docker-compose.yml -f docker-compose.local.yml down
```

- [ ] **Step 4: Revisar qué se va a subir**

Run: `git status --short` y `git check-ignore -v .env apps/api/.env apps/api/src/generated || true`
Expected: no aparecen `.env`, `node_modules`, `dist` ni `src/generated`; sí aparecen el addendum (`docs/superpowers/specs/2026-10-07-fase-2-design.md`) y los planes 2A y 2B si aún no se confirmaron (`git add` los incluye).

- [ ] **Step 5: Commit único de la Fase 2 y push**

Con la revisión final aprobada, confirmar en `fase-2` lo pendiente de esta tarea (README) y aplastar todo en `main`:

```bash
git add -A && git commit -m "docs: README de la fase 2"
git checkout main
git merge --squash fase-2
git commit -m "feat: implementa la fase 2 con planificación financiera, todo editable o eliminable y tema oscuro" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin main
git branch -D fase-2
```

Expected: `main` tiene un único commit nuevo (código, addendum y planes de la Fase 2) y el push a `origin/main` es exitoso. (`-D` porque la rama quedó aplastada en `main`.)

## Cierre del plan 2B

Con esto la Fase 2 queda completa y desplegable: Dokploy toma el commit de `main`, la API aplica la migración `fase2` al arrancar y la web sirve el tema oscuro por defecto.
