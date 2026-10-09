# Con quién B — Web y pruebas de punta a punta: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La parte visible de "con quién":
- la fila "¿Con quién?" en el registro rápido de gastos y compras con tarjeta;
- la compañía en la fila, el detalle y los filtros de Movimientos;
- la pestaña "Con quién" en Categorías, para administrar las opciones;
- dos gráficas nuevas en Reportes;
- los recorridos de punta a punta.

**Architecture:** Se siguen los patrones de la web que ya existen:
- consultas de TanStack Query con llaves `qk`, y `invalidateFinance` después de cada cambio;
- mutaciones de gestión con `useCrudMutation` y restaurar con `useRestore` (estado por fila);
- hojas Radix (`Sheet`) y gráficos de Recharts dentro del chunk diferido `charts`.

La web no suma dinero: el reporte ya trae `expenseByCompanion` y `companionMonths`, y la agrupación de la gráfica mensual es `groupCompanionSeries` de `@finanzas/shared`. "¿Con quién?" usa botones con `aria-pressed`, no un grupo de radio, porque la opción elegida se puede quitar.

**Tech Stack:** React 19, Vite 8 (Rolldown), Tailwind 4, TanStack Query 5, React Router 7, Radix Dialog, Recharts 3, lucide-react, Vitest 5 + Testing Library, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-10-08-con-quien-design.md` (§3, §4.3, §5 y §6). Requiere el plan A terminado (`docs/superpowers/plans/2026-10-08-con-quien-a-backend.md`).

**Rama:** `con-quien`, después de las 5 tareas del plan A.

## Global Constraints

- Interfaz en español (es-CO), con concordancia de género: "la opción" (Opción creada, actualizada, eliminada, restaurada; "(eliminada)"); código, nombres y tests en inglés.
- Ningún cálculo de dinero en el navegador: las únicas agrupaciones permitidas son `groupTop` y `groupCompanionSeries` de `@finanzas/shared`; los valores salen con `formatCOP` y los ejes con `formatCOPCompact`.
- "¿Con quién?" aparece en gasto y compra con tarjeta, nunca en ingresos. Va siempre visible (no en "Más opciones"), sin opción elegida al empezar, y un segundo toque quita la elegida. El cuerpo lleva `companionId` (uuid o `null`) solo en `EXPENSE` y `CARD_PURCHASE`.
- Toda acción que escribe usa `requiresNetwork` (los `type="submit"`, `ConfirmButton` y `DeletedSection` ya lo hacen) y mutaciones con `networkMode: 'always'` (ya es el valor por defecto de la app).
- Un doble toque nunca envía dos veces. Cada fila tiene su propia mutación o su propio estado de "ocupado". Las listas de `toFormErrors` incluyen todos los campos que el servidor puede señalar y que el formulario muestra.
- Los tests verifican los cuerpos enviados con `toEqual`.
- Zonas de toque ≥ 44 px (`min-h-11`); contraste AA en claro y oscuro; `prefers-reduced-motion` respetado (los gráficos ya usan `isAnimated`).
- Carga inicial (`npm run check:bundle -w @finanzas/web`) ≤ 192250 B en gzip (hoy 189924 B). Los gráficos nuevos van en el chunk diferido `charts`.
- Sin dependencias nuevas. Archivos UTF-8 sin BOM y LF. La verificación de cada tarea incluye `npm run typecheck` y `npm run format:check` (desde la raíz).
- Cada tarea termina con un commit en `con-quien` con un mensaje de una frase en español. El commit único en `main` lo hace el controlador al final.
- Nunca subir `.env` (tampoco `e2e/.env.e2e`). No tocar el proyecto de Compose `finanzas-dev`. `docker compose down` siempre sin `-v`.

## Decisiones del plan

1. Gráficas con la paleta del tema y no con el color de cada opción, porque un color oscuro (Solo, `#475569`) no se ve en el tema oscuro; el spec se corrigió. Colores:
   - las compañías usan `seriesColor(i)` según su puesto, y el mismo color en las dos gráficas;
   - "Otros" usa `var(--chart-other)`;
   - "Sin indicar" usa `var(--muted)`.
2. La pestaña de Categorías sale de la URL (`?tab=expense|income|tags|companions`, por defecto `expense`) y no de un `useState`. Así "Editar opciones" (`/categories?tab=companions`) cambia de pestaña aunque Categorías ya esté abierta, y al cambiar de pestaña se usa `replace`, sin llenar el historial.
3. "Editar opciones" sale del registro rápido y lo cierra (llama a `onDone`, como `NeedsAccount`). Lo escrito en el formulario se pierde, igual que al cerrarlo.
4. Si `/api/companions` falla o tarda, el formulario no espera: la fila no aparece y se guarda con la compañía que ya tenía el estado (`null`, o la del movimiento que se edita).
5. En la fila de Movimientos, el ícono de la compañía va al comienzo del subtítulo. Es un `role="img"` con nombre "Con Amigos" (o "Con Vecinos (eliminada)"), así entra en el nombre del botón de la fila.
6. El filtro "Con quién" es un `Select` (como Categoría y Etiqueta): "Todos", "Sin indicar" (`none`) y cada opción, incluidas las eliminadas marcadas.
7. La lista de opciones está en `CompanionsList.tsx` y su hoja en `CompanionFormSheet.tsx`, dentro de `features/categories`. El encabezado de Categorías solo muestra "Nueva" en Gastos e Ingresos; la pestaña "Con quién" trae su propio "Nueva" (nombre accesible "Nueva opción").
8. El formulario de opción guarda `{ name, icon, color }` y usa un guard con `useRef` contra el doble toque. `COMPANION_NAME_TAKEN` se muestra debajo del nombre.
9. Estado vacío de las dos gráficas ("Aún no has indicado con quién gastas."): se muestra si ninguna serie es una compañía, es decir, si no hay gastos o si todos están "Sin indicar".
10. Los recorridos de punta a punta eligen "Amigos" con `addExpense(page, amount, category, companion?)`. axe revisa además `/categories?tab=companions`.

## Review Focus

1. Editar un gasto cuya compañía fue eliminada sin tocar "¿Con quién?" → la opción aparece marcada "(eliminada)" y elegida, y el cuerpo la conserva (Tarea 1).
2. `/api/companions` falla al abrir el registro rápido → el gasto se guarda igual, sin la fila y con `companionId: null` (Tarea 1).
3. Categorías ya abierta en Gastos y se toca "Editar opciones" (cambia solo `?tab=`) → la pestaña pasa a "Con quién" (Tarea 3).
4. Doble toque en "Guardar opción" → un solo `POST` (Tarea 3).
5. Todos los gastos del periodo "Sin indicar" → las dos gráficas muestran el estado vacío y no una barra gris sola (Tarea 4).

Tests de cada línea:

| # | Archivo | Test |
|---|---|---|
| 1 | `TransactionForm.test.tsx` | "keeps a deleted option marked and selected when editing, and can clear it" |
| 2 | `TransactionForm.test.tsx` | "still saves when the options cannot load" |
| 3 | `CompanionsList.test.tsx` | "switches to the tab when only the query changes" |
| 4 | `CompanionsList.test.tsx` | "creates an option once even with a double tap" |
| 5 | `ReportCharts.test.tsx` | "shows the empty state when every expense is Sin indicar" |

---

### Task 1: "¿Con quién?" en el registro rápido

**Files:**
- Modify: `apps/web/src/lib/icons.tsx` (íconos `heart`, `user`, `users`)
- Modify: `apps/web/src/lib/queries.ts` (`qk.companions`, `useCompanions`, `invalidateFinance`)
- Create: `apps/web/src/features/quick-add/CompanionPicker.tsx`
- Modify: `apps/web/src/features/quick-add/TransactionForm.tsx`
- Test: `apps/web/src/features/quick-add/TransactionForm.test.tsx`

**Interfaces:**
- Consumes (plan A):
  - `GET /api/companions` → `{ items: CompanionDTO[] }`;
  - `CompanionDTO`, `CompanionRefDTO` y `TransactionDTO.companion` de `@finanzas/shared`;
  - en `POST/PUT /api/transactions`, `companionId` en `EXPENSE`/`CARD_PURCHASE` (400 `INVALID_REFERENCE` con `fields.companionId`).
- Produces:
  - `qk.companions = ['companions']` y `useCompanions(): UseQueryResult<CompanionDTO[]>`;
  - `CompanionPicker({ options: CompanionRefDTO[], value: string | null, onChange: (id: string | null) => void, onNavigate: () => void, error?: string })`;
  - `Icon` reconoce `heart`, `user` y `users`.

- [ ] **Step 1: Tests (fallan)**

En `apps/web/src/features/quick-add/TransactionForm.test.tsx`:

1. Debajo de `const categories = […]`, agregar:

```ts
const companions = [
  { id: 'p1', name: 'Solo', icon: 'user', color: '#475569', isActive: true, sortOrder: 0, usageCount: 0 },
  { id: 'p2', name: 'Pareja', icon: 'heart', color: '#be185d', isActive: true, sortOrder: 1, usageCount: 2 },
  { id: 'p3', name: 'Vecinos', icon: 'home', color: '#2563eb', isActive: false, sortOrder: 2, usageCount: 1 },
  { id: 'p4', name: 'Amigos', icon: 'users', color: '#c2410c', isActive: true, sortOrder: 3, usageCount: 5 },
];
```

2. En `setup`, agregar `'GET /companions': () => ({ status: 200, body: { items: companions } }),` después de `'GET /categories'`.

3. Los cuerpos de gasto y compra con tarjeta ahora llevan `companionId`. En los `toEqual` de "switches a card purchase back to an expense…" y "keeps the installments of a frozen card purchase", y en el `toEqual` del test que edita el gasto de "Nequi" eliminada, agregar `companionId: null,`. En la constante `expense` de los tests de recurrencia, agregar `companionId: null,`. En ese mismo test de "Nequi", el texto de la nota pasa a `'"Nequi" fue eliminada: solo puedes cambiar la categoría, con quién, la descripción, las etiquetas y las notas. Restáurala'`.

4. Agregar al final del archivo:

```tsx
describe('TransactionForm — con quién (spec con quién §3.1)', () => {
  const option = (name: string) => screen.getByRole('button', { name, exact: true });

  it('shows the options without preselection; a second tap clears the chosen one', async () => {
    setup();
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await screen.findByRole('group', { name: '¿Con quién?' });
    expect(screen.queryByRole('button', { name: 'Vecinos', exact: true })).not.toBeInTheDocument();
    for (const name of ['Solo', 'Pareja', 'Amigos']) {
      expect(option(name)).toHaveAttribute('aria-pressed', 'false');
    }
    await userEvent.click(option('Amigos'));
    expect(option('Amigos')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(option('Pareja'));
    expect(option('Amigos')).toHaveAttribute('aria-pressed', 'false');
    expect(option('Pareja')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(option('Pareja'));
    expect(option('Pareja')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(option('Amigos'));
    await userEvent.type(screen.getByLabelText('Valor'), '25000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      type: 'EXPENSE',
      amount: 25_000,
      date: expect.any(String),
      categoryId: 'k1',
      description: null,
      notes: null,
      tags: [],
      accountId: 'a1',
      paymentMethod: null,
      companionId: 'p4',
    });
  });

  it('sends who with a card purchase, and never shows it for an income', async () => {
    setup();
    const { unmount } = renderWithProviders(
      <TransactionForm mode="expense" onDone={() => undefined} />,
    );
    await userEvent.type(await screen.findByLabelText('Valor'), '90000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Nu Crédito/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Solo', exact: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      type: 'CARD_PURCHASE',
      amount: 90_000,
      date: expect.any(String),
      categoryId: 'k1',
      description: null,
      notes: null,
      tags: [],
      creditCardId: 'c1',
      installments: 1,
      companionId: 'p1',
    });
    unmount();

    renderWithProviders(<TransactionForm mode="income" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '100000');
    await userEvent.click(screen.getByRole('radio', { name: /Salario/ }));
    expect(screen.queryByText('¿Con quién?')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).not.toHaveProperty('companionId');
  });

  it('keeps a deleted option marked and selected when editing, and can clear it', async () => {
    const puts: Record<string, unknown>[] = [];
    setup(false, {
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
      companion: { id: 'p3', name: 'Vecinos', icon: 'home', color: '#2563eb', isActive: false },
    } as unknown as TransactionDTO;
    const { unmount } = renderWithProviders(
      <TransactionForm mode="expense" edit={edit} onDone={() => undefined} />,
    );
    const deleted = await screen.findByRole('button', { name: 'Vecinos (eliminada)' });
    expect(deleted).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ companionId: 'p3' });
    unmount();

    renderWithProviders(<TransactionForm mode="expense" edit={edit} onDone={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Vecinos (eliminada)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toEqual({
      type: 'EXPENSE',
      amount: 8000,
      date: '2026-10-05',
      categoryId: 'k1',
      description: null,
      notes: null,
      tags: [],
      accountId: 'a1',
      paymentMethod: null,
      payee: null,
      companionId: null,
    });
  });

  it('still saves when the options cannot load', async () => {
    setup(false, {
      'GET /companions': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'Error' } },
      }),
    });
    const onDone = vi.fn();
    renderWithProviders(<TransactionForm mode="expense" onDone={onDone} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '12000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByText('¿Con quién?')).not.toBeInTheDocument();
    expect(posted[0]).toMatchObject({ type: 'EXPENSE', companionId: null });
  });

  it('links "Editar opciones" to the tab and closes the sheet', async () => {
    setup();
    const onDone = vi.fn();
    renderWithProviders(<TransactionForm mode="expense" onDone={onDone} />);
    const link = await screen.findByRole('link', { name: 'Editar opciones' });
    expect(link).toHaveAttribute('href', '/categories?tab=companions');
    await userEvent.click(link);
    expect(onDone).toHaveBeenCalled();
  });

  it('shows the server error under the row', async () => {
    setup(false, {
      'POST /transactions': () => ({
        status: 400,
        body: {
          error: {
            code: 'INVALID_REFERENCE',
            message: 'Revisa las cuentas, tarjetas o categorías seleccionadas.',
            fields: { companionId: 'La opción fue eliminada' },
          },
        },
      }),
    });
    renderWithProviders(<TransactionForm mode="expense" onDone={() => undefined} />);
    await userEvent.type(await screen.findByLabelText('Valor'), '12000');
    await userEvent.click(screen.getByRole('radio', { name: /Alimentación/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Pareja', exact: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('La opción fue eliminada')).toBeInTheDocument();
  });
});
```

Run: `npm test -w @finanzas/web -- src/features/quick-add/TransactionForm.test.tsx`
Expected: FAIL (no existe el grupo "¿Con quién?").

- [ ] **Step 2: Íconos y consulta**

En `apps/web/src/lib/icons.tsx`, agregar `Heart`, `User` y `Users` al import de `lucide-react` (en orden alfabético), y al objeto `ICONS` las claves `heart: Heart,` (después de `gift`), `user: User,` y `users: Users,` (después de `'trending-up'`).

En `apps/web/src/lib/queries.ts`:

1. Agregar `CompanionDTO` al import de tipos.
2. En `qk`, después de `tags: ['tags'] as const,`, agregar `companions: ['companions'] as const,`.
3. En `invalidateFinance`, después de `qk.tags,`, agregar:

```ts
      // Cada gasto cambia el número de usos de su opción de "con quién".
      qk.companions,
```

4. Después de `useCategories`, agregar:

```ts
export const useCompanions = () =>
  useQuery({
    queryKey: qk.companions,
    queryFn: () => items<CompanionDTO>('/companions'),
    staleTime: 5 * 60_000,
  });
```

- [ ] **Step 3: `CompanionPicker`**

Crear `apps/web/src/features/quick-add/CompanionPicker.tsx`:

```tsx
import type { CompanionRefDTO } from '@finanzas/shared';
import { useId } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { Icon } from '../../lib/icons';
import { refName } from '../../lib/refs';

/**
 * Spec con quién §3.1: una opción o ninguna, sin preselección; tocar la elegida la quita. Son
 * botones con `aria-pressed` (no un grupo de radio) porque la elección se puede deshacer.
 */
export function CompanionPicker({
  options,
  value,
  onChange,
  onNavigate,
  error,
}: {
  options: CompanionRefDTO[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** "Editar opciones" sale del registro rápido: cierra la hoja. */
  onNavigate: () => void;
  error?: string;
}) {
  const labelId = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p id={labelId} className="text-sm font-medium">
          ¿Con quién?
        </p>
        <Link
          to="/categories?tab=companions"
          onClick={onNavigate}
          className="-my-2 inline-flex min-h-11 items-center px-1 text-sm text-primary"
        >
          Editar opciones
        </Link>
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-muted">No tienes opciones activas.</p>
      ) : (
        <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
          {options.map((c) => {
            const pressed = value === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onChange(pressed ? null : c.id)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  pressed
                    ? 'border-primary bg-primary font-medium text-primary-fg'
                    : 'border-border bg-surface text-fg',
                )}
              >
                <Icon name={c.icon} size={16} />
                {refName(c)}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Conectarlo en `TransactionForm`**

En `apps/web/src/features/quick-add/TransactionForm.tsx`:

1. Imports: agregar `useCompanions` al import de `../../lib/queries` y `import { CompanionPicker } from './CompanionPicker';`.
2. Después de `const categories = useCategories();`, agregar `const companions = useCompanions();`.
3. Después del estado `categoryId`, agregar:

```ts
  const [companionId, setCompanionId] = useState<string | null>(edit?.companion?.id ?? null);
```

4. Después del cálculo de `visibleRoots` (antes de `if (accounts.isPending …)`), agregar:

```ts
  // Spec con quién §3.1: las opciones activas y, al editar, la del movimiento aunque esté eliminada.
  const companionOptions = [
    ...(companions.data ?? []).filter((c) => c.isActive),
    ...(edit?.companion && !edit.companion.isActive ? [edit.companion] : []),
  ];
```

5. En `toFormErrors(err, [ … ])`, agregar `'companionId',` después de `'categoryId',`.
6. En `build()`, en las dos ramas de gasto, agregar `companionId,`:
   - en la de `CARD_PURCHASE`, después de `installments: n,`;
   - en la de `EXPENSE`, después de `paymentMethod: paymentMethod || null,`.

   La rama de `INCOME` no cambia.
7. En `FrozenNote`, la lista `editable` pasa a:

```ts
            editable={[
              'la categoría',
              ...(mode === 'expense' ? ['con quién'] : []),
              'la descripción',
              'las etiquetas',
              ...(mode === 'income' ? ['la fuente'] : []),
              'las notas',
            ]}
```

8. Después del `div` de "Categoría" (el que termina con `{errors.categoryId && …}`), agregar:

```tsx
        {mode === 'expense' && companions.data && (
          <CompanionPicker
            options={companionOptions}
            value={companionId}
            onChange={setCompanionId}
            onNavigate={onDone}
            error={errors.companionId}
          />
        )}
```

- [ ] **Step 5: Correr los tests y medir la carga inicial**

Run: `npm test -w @finanzas/web`
Expected: PASS (todo el paquete web).
Run: `npm run build -w @finanzas/web && npm run check:bundle -w @finanzas/web`
Expected: OK, ≤ 192250 B. Anotar el tamaño en el reporte de la tarea.
Run (raíz): `npm run typecheck` y `npm run format:check`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/icons.tsx apps/web/src/lib/queries.ts apps/web/src/features/quick-add/CompanionPicker.tsx apps/web/src/features/quick-add/TransactionForm.tsx apps/web/src/features/quick-add/TransactionForm.test.tsx
git commit -m "feat: agrega la fila con quién al registro rápido de gastos"
```

---

### Task 2: Movimientos: fila, detalle y filtro

**Files:**
- Modify: `apps/web/src/features/transactions/TransactionRow.tsx`
- Modify: `apps/web/src/features/transactions/TransactionDetailSheet.tsx`
- Modify: `apps/web/src/features/transactions/filters.ts`
- Modify: `apps/web/src/features/transactions/FiltersSheet.tsx`
- Test: `TransactionRow.test.tsx`, `TransactionDetailSheet.test.tsx`, `filters.test.ts` y `FiltersSheet.test.tsx` (en la misma carpeta)

**Interfaces:**
- Consumes: `useCompanions` (Tarea 1), `TransactionDTO.companion` y el filtro `companionId=<uuid>|none` de `GET /api/transactions` (plan A).
- Produces: `TxFilters.companionId: string` (`''` = todas, `'none'` = sin indicar, o un uuid).

- [ ] **Step 1: Tests (fallan)**

1. `TransactionRow.test.tsx`, al final del `describe`:

```tsx
  it('shows who the expense was with as part of the row name', () => {
    const { rerender } = render(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{
          ...base,
          description: 'Asado',
          companion: { ...ref('p4', 'Amigos'), icon: 'users' },
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Con Amigos' })).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAccessibleName(/Con Amigos/);
    rerender(
      <TransactionRow
        onSelect={() => undefined}
        transaction={{ ...base, companion: { ...ref('p3', 'Vecinos'), isActive: false } }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Con Vecinos (eliminada)' })).toBeInTheDocument();
    rerender(<TransactionRow onSelect={() => undefined} transaction={base} />);
    expect(screen.queryByRole('img', { name: /^Con / })).not.toBeInTheDocument();
  });
```

2. `TransactionDetailSheet.test.tsx`, al final del `describe`:

```tsx
  it('shows who an expense was with, marking a deleted option', () => {
    renderWithProviders(
      <QuickAddProvider>
        <TransactionDetailSheet
          transaction={{
            ...disbursement,
            type: 'EXPENSE',
            debt: null,
            companion: {
              id: 'p3',
              name: 'Vecinos',
              icon: 'home',
              color: '#2563eb',
              isActive: false,
            },
          }}
          onClose={() => undefined}
        />
      </QuickAddProvider>,
    );
    expect(screen.getByText('Con quién')).toBeInTheDocument();
    expect(screen.getByText('Vecinos (eliminada)')).toBeInTheDocument();
  });
```

3. `filters.test.ts`: en el primer test, agregar `companionId: 'none',` al objeto de filtros y `companionId: 'none',` al `toEqual` de los parámetros (después de `accountId`). Agregar `expect(activeFilterCount({ ...EMPTY_FILTERS, companionId: 'p4' })).toBe(1);`.

4. `FiltersSheet.test.tsx`, al final del `describe`:

```tsx
  it('filters by who, with "Sin indicar" and deleted options marked', async () => {
    mockApi({
      'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
      'GET /accounts': () => ({ status: 200, body: { items: [] } }),
      'GET /credit-cards': () => ({ status: 200, body: { items: [] } }),
      'GET /categories': () => ({ status: 200, body: { items: [] } }),
      'GET /tags': () => ({ status: 200, body: { items: [] } }),
      'GET /companions': () => ({
        status: 200,
        body: {
          items: [
            { id: 'p4', name: 'Amigos', icon: 'users', color: '#c2410c', isActive: true, sortOrder: 0, usageCount: 2 },
            { id: 'p3', name: 'Vecinos', icon: 'home', color: '#2563eb', isActive: false, sortOrder: 1, usageCount: 1 },
          ],
        },
      }),
    });
    const onApply = vi.fn();
    renderWithProviders(
      <FiltersSheet open onOpenChange={() => undefined} value={EMPTY_FILTERS} onApply={onApply} />,
    );
    const select = await screen.findByLabelText('Con quién');
    expect(
      await screen.findByRole('option', { name: 'Vecinos (eliminada)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sin indicar' })).toHaveAttribute('value', 'none');
    await userEvent.selectOptions(select, 'p4');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApply).toHaveBeenCalledWith({ ...EMPTY_FILTERS, companionId: 'p4' });
  });
```

Run: `npm test -w @finanzas/web -- src/features/transactions`
Expected: FAIL.

- [ ] **Step 2: Fila y detalle**

En `TransactionRow.tsx`, agregar `import { refName } from '../../lib/refs';` y reemplazar el `<span className="block truncate text-xs text-muted">{d.subtitle}</span>` por:

```tsx
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
          {transaction.companion && (
            // Spec con quién §3.2: el ícono es parte del nombre de la fila ("Con Amigos").
            <span
              role="img"
              aria-label={`Con ${refName(transaction.companion)}`}
              className="inline-flex shrink-0"
            >
              <Icon name={transaction.companion.icon} size={12} />
            </span>
          )}
          <span className="min-w-0 truncate">{d.subtitle}</span>
        </span>
```

En `TransactionDetailSheet.tsx`, en `rows`, después de `['Categoría', refName(transaction.category)],`, agregar `['Con quién', refName(transaction.companion)],`.

- [ ] **Step 3: Filtro**

En `filters.ts`:
- en `TxFilters`, agregar `companionId: string;` después de `categoryId`;
- en `EMPTY_FILTERS`, agregar `companionId: '',`;
- en `activeFilterCount`, agregar `!!f.companionId,` después de `!!f.categoryId,`;
- en `filtersToParams`, agregar `set('companionId', f.companionId);` después de `set('categoryId', …)`.

En `FiltersSheet.tsx`, agregar `useCompanions` al import de `../../lib/queries`. Después de `const categories = useCategories();`, agregar `const companions = useCompanions();`. Después del `Field` de "Categoría", agregar:

```tsx
      <Field label="Con quién" htmlFor="f-companion" hint="Gastos y compras con tarjeta.">
        <Select
          id="f-companion"
          value={draft.companionId}
          onChange={(e) => set('companionId', e.target.value)}
        >
          <option value="">Todos</option>
          <option value="none">Sin indicar</option>
          {(companions.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {refName(c)}
            </option>
          ))}
        </Select>
      </Field>
```

- [ ] **Step 4: Correr y verificar**

Run: `npm test -w @finanzas/web`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm run format:check`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/transactions
git commit -m "feat: muestra con quién en Movimientos y permite filtrar por eso"
```

---

### Task 3: Pestaña "Con quién" en Categorías

**Files:**
- Modify: `apps/web/src/features/categories/CategoriesPage.tsx`
- Create: `apps/web/src/features/categories/CompanionsList.tsx`
- Create: `apps/web/src/features/categories/CompanionFormSheet.tsx`
- Test: `apps/web/src/features/categories/CompanionsList.test.tsx`

**Interfaces:**
- Consumes:
  - Tarea 1: `useCompanions` y `qk.companions`.
  - Ya existentes: `useCrudMutation`, `useRestore`, `DeletedSection`, `IconPicker`/`ColorPicker`, `ConfirmButton`, `Sheet` y `toFormErrors`.
  - Plan A: `POST/PUT/DELETE /api/companions` y `POST /api/companions/:id/restore`.
- Produces:
  - la ruta `/categories?tab=companions` abre la pestaña "Con quién";
  - `CompanionsList()`;
  - `CompanionFormSheet({ open, onOpenChange, companion? })`.

- [ ] **Step 1: Tests (fallan)**

Crear `apps/web/src/features/categories/CompanionsList.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmTwice, demoUser, mockApi, renderWithProviders } from '../../test-utils';
import { CategoriesPage } from './CategoriesPage';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const option = (over: Record<string, unknown>) => ({
  id: 'p4',
  name: 'Amigos',
  icon: 'users',
  color: '#c2410c',
  isActive: true,
  sortOrder: 3,
  usageCount: 3,
  ...over,
});
const OPTIONS = [
  option({ id: 'p1', name: 'Solo', icon: 'user', color: '#475569', sortOrder: 0, usageCount: 0 }),
  option({ id: 'p2', name: 'Pareja', icon: 'heart', color: '#be185d', sortOrder: 1, usageCount: 1 }),
  option({ id: 'p3', name: 'Vecinos', icon: 'home', isActive: false, sortOrder: 2, usageCount: 2 }),
  option({}),
];

function setup(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /auth/me': () => ({ status: 200, body: { user: demoUser } }),
    'GET /categories': () => ({ status: 200, body: { items: [] } }),
    'GET /companions': () => ({ status: 200, body: { items: OPTIONS } }),
    ...extra,
  });
}

describe('CompanionsList (spec con quién §3.3)', () => {
  it('opens on the tab from the link and lists active options with their use', async () => {
    setup();
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    expect(await screen.findByRole('radio', { name: 'Con quién' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await screen.findByRole('button', { name: /Amigos.*3 gastos/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pareja.*1 gasto/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solo.*Sin usar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Vecinos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva categoría' })).not.toBeInTheDocument();
  });

  it('switches to the tab when only the query changes', async () => {
    setup();
    renderWithProviders(
      <>
        <Link to="/categories?tab=companions">Editar opciones</Link>
        <CategoriesPage />
      </>,
      { route: '/categories' },
    );
    expect(await screen.findByRole('radio', { name: 'Gastos' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('link', { name: 'Editar opciones' }));
    expect(screen.getByRole('radio', { name: 'Con quién' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await screen.findByRole('button', { name: 'Nueva opción' })).toBeInTheDocument();
  });

  it('creates an option once even with a double tap, sending exactly name, icon and color', async () => {
    const posted: unknown[] = [];
    let release: () => void = () => undefined;
    setup({
      'POST /companions': async (body) => {
        posted.push(body);
        await new Promise<void>((resolve) => (release = resolve));
        return { status: 201, body: { companion: option({ id: 'p9', name: 'Primos' }) } };
      },
    });
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva opción' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nueva opción' });
    await userEvent.type(within(sheet).getByLabelText('Nombre'), 'Primos');
    await userEvent.click(within(sheet).getByRole('radio', { name: 'heart' }));
    await userEvent.click(within(sheet).getByRole('radio', { name: '#ec4899' }));
    const save = within(sheet).getByRole('button', { name: 'Guardar opción' });
    await userEvent.dblClick(save);
    // La petición queda retenida hasta aquí: el segundo toque llegó mientras volaba.
    await waitFor(() => expect(posted).toHaveLength(1));
    release();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nueva opción' })).not.toBeInTheDocument(),
    );
    expect(posted).toEqual([{ name: 'Primos', icon: 'heart', color: '#ec4899' }]);
    expect(await screen.findByText('Opción creada')).toBeInTheDocument();
  });

  it('shows a repeated name under the field', async () => {
    setup({
      'POST /companions': () => ({
        status: 409,
        body: {
          error: {
            code: 'COMPANION_NAME_TAKEN',
            message: 'Ya existe una opción eliminada con ese nombre; restáurala.',
          },
        },
      }),
    });
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva opción' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nueva opción' });
    await userEvent.type(within(sheet).getByLabelText('Nombre'), 'Vecinos');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar opción' }));
    expect(
      await within(sheet).findByText('Ya existe una opción eliminada con ese nombre; restáurala.'),
    ).toBeInTheDocument();
  });

  it('edits one option and deletes another keeping its history', async () => {
    const puts: unknown[] = [];
    const deletes: string[] = [];
    setup({
      'PUT /companions/p4': (body) => {
        puts.push(body);
        return { status: 200, body: { companion: option({ name: 'Amigos del barrio' }) } };
      },
      'DELETE /companions/p2': () => {
        deletes.push('p2');
        return { status: 200, body: { deleted: 'soft' } };
      },
    });
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    await userEvent.click(await screen.findByRole('button', { name: /Amigos.*3 gastos/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar opción' });
    const name = within(sheet).getByLabelText('Nombre');
    await userEvent.clear(name);
    await userEvent.type(name, 'Amigos del barrio');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar opción' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ name: 'Amigos del barrio', icon: 'users', color: '#c2410c' });

    await userEvent.click(await screen.findByRole('button', { name: /Pareja.*1 gasto/ }));
    await screen.findByRole('dialog', { name: 'Editar opción' });
    await confirmTwice('Eliminar opción');
    await waitFor(() => expect(deletes).toEqual(['p2']));
    expect(
      await screen.findByText('Opción eliminada: se conserva en tus gastos'),
    ).toBeInTheDocument();
  });

  it('restores a deleted option', async () => {
    const restored: string[] = [];
    setup({
      'POST /companions/p3/restore': () => {
        restored.push('p3');
        return { status: 200, body: { companion: option({ id: 'p3', name: 'Vecinos' }) } };
      },
    });
    renderWithProviders(<CategoriesPage />, { route: '/categories?tab=companions' });
    await userEvent.click(await screen.findByRole('button', { name: /Eliminados \(1\)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar Vecinos' }));
    await waitFor(() => expect(restored).toEqual(['p3']));
  });
});
```

Run: `npm test -w @finanzas/web -- src/features/categories`
Expected: FAIL.

- [ ] **Step 2: Pestaña desde la URL**

En `apps/web/src/features/categories/CategoriesPage.tsx`:

1. Imports: `import { useSearchParams } from 'react-router';` y `import { CompanionsList } from './CompanionsList';`.
2. Reemplazar `type Tab = CategoryKind | 'TAGS';` por:

```ts
type Tab = CategoryKind | 'TAGS' | 'COMPANIONS';

/** Decisión B2: la pestaña vive en `?tab=` para que "Editar opciones" la abra aunque la pantalla ya esté abierta. */
const TABS: Record<string, Tab> = {
  expense: 'EXPENSE',
  income: 'INCOME',
  tags: 'TAGS',
  companions: 'COMPANIONS',
};
```

3. Reemplazar `const [tab, setTab] = useState<Tab>('EXPENSE');` por:

```ts
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS[params.get('tab') ?? ''] ?? 'EXPENSE';
  const setTab = (next: Tab) => setParams({ tab: next.toLowerCase() }, { replace: true });
```

4. El botón "Nueva" del encabezado se muestra solo en Gastos e Ingresos: cambiar `{tab !== 'TAGS' && (` por `{(tab === 'EXPENSE' || tab === 'INCOME') && (`.
5. En las opciones de `Chips`, agregar `{ value: 'COMPANIONS', label: 'Con quién' },` después de Etiquetas.
6. Reemplazar `{tab === 'TAGS' ? (<TagsList />) : (` por:

```tsx
      {tab === 'TAGS' ? (
        <TagsList />
      ) : tab === 'COMPANIONS' ? (
        <CompanionsList />
      ) : (
```

(El resto del JSX no cambia.)

- [ ] **Step 3: Lista y hoja de opciones**

Crear `apps/web/src/features/categories/CompanionsList.tsx`:

```tsx
import type { CompanionDTO } from '@finanzas/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { DeletedSection } from '../../components/ui/DeletedSection';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { Icon } from '../../lib/icons';
import { useCompanions } from '../../lib/queries';
import { useRestore } from '../../lib/useRestore';
import { CompanionFormSheet } from './CompanionFormSheet';

const usage = (n: number) => (n === 0 ? 'Sin usar' : n === 1 ? '1 gasto' : `${n} gastos`);

/** Spec con quién §3.3: las opciones de "¿Con quién?", con Eliminados y Restaurar. */
export function CompanionsList() {
  const companions = useCompanions();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompanionDTO | undefined>();
  const { restore, isRestoring } = useRestore(
    (id) => `/companions/${id}/restore`,
    'Opción restaurada',
  );
  if (companions.isPending) return <PageSpinner />;
  if (companions.isError)
    return <ErrorState error={companions.error} onRetry={() => void companions.refetch()} />;

  const active = companions.data.filter((c) => c.isActive);
  const edit = (c?: CompanionDTO) => {
    setEditing(c);
    setOpen(true);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Elige una al registrar un gasto para ver con quién gastas.</p>
        <Button size="sm" onClick={() => edit()} aria-label="Nueva opción">
          <Plus size={16} /> Nueva
        </Button>
      </div>
      {active.length === 0 ? (
        <EmptyState
          title="No tienes opciones"
          description="Crea una para indicar con quién gastas."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
          {active.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => edit(c)}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left"
              >
                <span
                  className="flex size-8 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: c.color }}
                >
                  <Icon name={c.icon} size={16} />
                </span>
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-muted">{usage(c.usageCount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <DeletedSection
        items={companions.data.filter((c) => !c.isActive)}
        isRestoring={isRestoring}
        onRestore={(c) => restore(c.id)}
      />
      <CompanionFormSheet open={open} onOpenChange={setOpen} companion={editing} />
    </div>
  );
}
```

Crear `apps/web/src/features/categories/CompanionFormSheet.tsx`:

```tsx
import type { CompanionDTO, DeleteResultDTO } from '@finanzas/shared';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Field, TextInput } from '../../components/ui/Field';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';
import { Sheet } from '../../components/ui/Sheet';
import { api, type ApiError } from '../../lib/api';
import { toFormErrors } from '../../lib/formErrors';
import { useCrudMutation } from '../../lib/useCrud';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companion?: CompanionDTO;
}

export function CompanionFormSheet({ open, onOpenChange, companion }: Props) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={companion ? 'Editar opción' : 'Nueva opción'}
    >
      {open && <CompanionForm companion={companion} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function CompanionForm({ companion, onDone }: { companion?: CompanionDTO; onDone: () => void }) {
  const [name, setName] = useState(companion?.name ?? '');
  const [icon, setIcon] = useState(companion?.icon ?? 'user');
  const [color, setColor] = useState(companion?.color ?? '#64748b');
  const [fields, setFields] = useState<Record<string, string>>({});
  // Un doble toque nunca envía dos veces (la mutación tarda un render en quedar "pendiente").
  const sending = useRef(false);
  const save = useCrudMutation(
    (body: { name: string; icon: string; color: string }) =>
      companion ? api.put(`/companions/${companion.id}`, body) : api.post('/companions', body),
    companion ? 'Opción actualizada' : 'Opción creada',
  );
  const remove = useCrudMutation(
    () => api.del<DeleteResultDTO>(`/companions/${companion!.id}`),
    (r) =>
      r.deleted === 'soft' ? 'Opción eliminada: se conserva en tus gastos' : 'Opción eliminada',
  );
  const onError = (err: ApiError) =>
    setFields(
      err.code === 'COMPANION_NAME_TAKEN'
        ? { name: err.message }
        : toFormErrors(err, ['name', 'icon', 'color']),
    );

  const submit = () => {
    if (sending.current) return;
    if (!name.trim()) return setFields({ name: 'Escribe un nombre' });
    sending.current = true;
    setFields({});
    save.mutate(
      { name, icon, color },
      {
        onSuccess: onDone,
        onError,
        onSettled: () => {
          sending.current = false;
        },
      },
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
      <Field label="Nombre" htmlFor="companion-name" error={fields.name}>
        <TextInput
          id="companion-name"
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Ícono</p>
        <IconPicker value={icon} onChange={setIcon} />
        {fields.icon && <p className="text-sm text-negative">{fields.icon}</p>}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color</p>
        <ColorPicker value={color} onChange={setColor} />
        {fields.color && <p className="text-sm text-negative">{fields.color}</p>}
      </div>
      {fields._ && (
        <p role="alert" className="text-sm text-negative">
          {fields._}
        </p>
      )}
      <Button type="submit" size="lg" loading={save.isPending}>
        Guardar opción
      </Button>
      {companion && (
        <div className="space-y-2">
          <ConfirmButton
            size="lg"
            loading={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: onDone, onError })}
          >
            Eliminar opción
          </ConfirmButton>
          <p className="text-xs text-muted">
            Si ya la usaste en algún gasto, se conserva en tu historial marcada como eliminada y
            puedes restaurarla.
          </p>
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Correr y verificar**

Run: `npm test -w @finanzas/web`
Expected: PASS (incluido `CategoriesPage.test.tsx`: la pestaña Etiquetas sigue funcionando con la URL).
Run (raíz): `npm run typecheck` y `npm run format:check`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/categories
git commit -m "feat: agrega la pestaña con quién en Categorías para editar las opciones"
```

---

### Task 4: Gráficas "Gastos por compañía" y "Con quién gastas, mes a mes"

**Files:**
- Create: `apps/web/src/features/reports/charts/companionSeries.ts`
- Create: `apps/web/src/features/reports/charts/CompanionBarsChart.tsx`
- Create: `apps/web/src/features/reports/charts/CompanionMonthsChart.tsx`
- Modify: `apps/web/src/features/reports/charts/ReportCharts.tsx`
- Test: `apps/web/src/features/reports/charts/ReportCharts.test.tsx`

**Interfaces:**
- Consumes (plan A): `groupCompanionSeries`, `CompanionSeries` y `ReportDTO.expenseByCompanion`/`companionMonths` de `@finanzas/shared`. El fixture `makeReport()` trae Amigos $900.000 (0,4186), Pareja $500.000 (0,2326), Familia (eliminada) $250.000 (0,1163) y Sin indicar $500.000 (0,2326); `makeEmptyReport()` no trae compañías.
- Produces: `seriesLabel(s)`, `seriesFill(s, i)`, `UNSET_COLOR` y `EMPTY_WHO` en `companionSeries.ts`; los componentes `CompanionBarsChart` y `CompanionMonthsChart`.

- [ ] **Step 1: Tests (fallan)**

En `apps/web/src/features/reports/charts/ReportCharts.test.tsx`:

1. Importar `import { EMPTY_WHO, seriesFill, UNSET_COLOR } from './companionSeries';` y agregar `OTHER_COLOR` al import de `./chartTheme`.
2. En el objeto `expected` de "shows the same data of every chart in its "Ver tabla" table", después de `'Gastos por categoría'`, agregar:

```ts
      'Gastos por compañía': [
        ['Amigos', '$900.000', '41,9 %'],
        ['Pareja', '$500.000', '23,3 %'],
        ['Familia (eliminada)', '$250.000', '11,6 %'],
        ['Sin indicar', '$500.000', '23,3 %'],
      ],
      'Con quién gastas, mes a mes': [
        ['octubre de 2026', '$900.000', '$500.000', '$250.000', '$500.000'],
      ],
```

3. En `messages` de "shows an empty state per chart when there is nothing to draw", agregar `'Gastos por compañía': EMPTY_WHO,` y `'Con quién gastas, mes a mes': EMPTY_WHO,`.
4. Agregar al `describe('ReportCharts', …)`:

```tsx
  it('names one column per series in the monthly table, "Sin indicar" last', async () => {
    render(<ReportCharts report={makeReport()} printMode={false} />);
    const title = 'Con quién gastas, mes a mes';
    await openTable(title);
    const headers = within(within(card(title)).getByRole('table', { name: title }))
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Mes', 'Amigos', 'Pareja', 'Familia (eliminada)', 'Sin indicar']);
  });

  it('keeps the "Gastos por compañía" table open when printing', () => {
    render(<ReportCharts report={makeReport()} printMode />);
    expect(rowsOf('Gastos por compañía')).toHaveLength(4);
  });

  it('colors options by rank, "Otros" and "Sin indicar" apart', () => {
    const ref = { id: 'x', name: 'X', icon: 'users', color: '#000000', isActive: true };
    expect(seriesFill({ key: 'x', companion: ref, amount: 1, share: 1 }, 0)).toBe(seriesColor(0));
    expect(seriesFill({ key: 'x', companion: ref, amount: 1, share: 1 }, 2)).toBe(seriesColor(2));
    expect(seriesFill({ key: 'other', companion: null, amount: 1, share: 1 }, 5)).toBe(OTHER_COLOR);
    expect(seriesFill({ key: 'none', companion: null, amount: 1, share: 1 }, 6)).toBe(UNSET_COLOR);
    expect(UNSET_COLOR).not.toBe(OTHER_COLOR);
  });
```

5. Agregar al `describe('ReportCharts edge cases …', …)`:

```tsx
  it('shows the empty state when every expense is Sin indicar', () => {
    const report = makeReport({
      expenseByCompanion: [{ companion: null, amount: 2_150_000, share: 1 }],
      companionMonths: [{ month: '2026-10', items: [{ companionId: null, amount: 2_150_000 }] }],
    });
    render(<ReportCharts report={report} printMode={false} />);
    for (const title of ['Gastos por compañía', 'Con quién gastas, mes a mes']) {
      expect(within(card(title)).getByText(EMPTY_WHO)).toBeVisible();
      expect(within(card(title)).queryByRole('button', { name: 'Ver tabla' })).not.toBeInTheDocument();
    }
  });
```

Run: `npm test -w @finanzas/web -- src/features/reports/charts`
Expected: FAIL.

- [ ] **Step 2: Series, colores y las dos gráficas**

Crear `apps/web/src/features/reports/charts/companionSeries.ts`:

```ts
import type { CompanionSeries } from '@finanzas/shared';
import { refName } from '../../../lib/refs';
import { OTHER_COLOR, seriesColor } from './chartTheme';

/** Decisión B1: "Sin indicar" se distingue de "Otros" en las barras apiladas. */
export const UNSET_COLOR = 'var(--muted)';

export const EMPTY_WHO = 'Aún no has indicado con quién gastas.';

export const seriesLabel = (s: CompanionSeries): string =>
  s.key === 'other' ? 'Otros' : s.key === 'none' ? 'Sin indicar' : (refName(s.companion) ?? '');

/** Las compañías van primero, así `i` es su puesto y tienen el mismo color en las dos gráficas. */
export const seriesFill = (s: CompanionSeries, i: number): string =>
  s.key === 'other' ? OTHER_COLOR : s.key === 'none' ? UNSET_COLOR : seriesColor(i);

/** Decisión B9: sin gastos con compañía en el periodo, las dos gráficas muestran el estado vacío. */
export const hasWho = (series: CompanionSeries[]): boolean =>
  series.some((s) => s.companion !== null);
```

Crear `apps/web/src/features/reports/charts/CompanionBarsChart.tsx`:

```tsx
import { formatCOP, groupCompanionSeries, type ReportDTO } from '@finanzas/shared';
import { ChartCard, ChartEmpty } from './ChartCard';
import { formatShare } from './chartTheme';
import { EMPTY_WHO, hasWho, seriesFill, seriesLabel } from './companionSeries';
import { HorizontalBars, type BarRow } from './HorizontalBars';

/** Gastos por compañía en el periodo (spec con quién §4.3): 5, "Otros" y "Sin indicar". */
export function CompanionBarsChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const { series } = groupCompanionSeries(report.expenseByCompanion, report.companionMonths);
  const empty = !hasWho(series);
  const rows = series.map((s, i) => ({
    name: seriesLabel(s),
    value: s.amount,
    share: s.share,
    color: seriesFill(s, i),
  })) satisfies Array<BarRow & { share: number }>;
  return (
    <ChartCard
      title="Gastos por compañía"
      alwaysShowTable={printMode}
      table={{
        columns: ['Con quién', 'Valor', 'Porcentaje'],
        rows: empty ? [] : rows.map((r) => [r.name, formatCOP(r.value), formatShare(r.share)]),
      }}
    >
      {empty ? (
        <ChartEmpty>{EMPTY_WHO}</ChartEmpty>
      ) : (
        <HorizontalBars rows={rows} printMode={printMode} />
      )}
    </ChartCard>
  );
}
```

Crear `apps/web/src/features/reports/charts/CompanionMonthsChart.tsx`:

```tsx
import { formatCOP, groupCompanionSeries, type ReportDTO } from '@finanzas/shared';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonthYear } from '../../../lib/format';
import { ChartCard, ChartEmpty, ChartFrame } from './ChartCard';
import {
  AXIS_TICK,
  axisMoney,
  GRID_STROKE,
  isAnimated,
  monthTickFormatter,
  TOOLTIP_STYLE,
  tooltipMoney,
} from './chartTheme';
import { EMPTY_WHO, hasWho, seriesFill, seriesLabel } from './companionSeries';

/** Con quién gastas, mes a mes (spec con quién §4.3): barras apiladas con las series de §4.2. */
export function CompanionMonthsChart({
  report,
  printMode = false,
}: {
  report: ReportDTO;
  printMode?: boolean;
}) {
  const { series, months } = groupCompanionSeries(
    report.expenseByCompanion,
    report.companionMonths,
  );
  const empty = !hasWho(series);
  const animate = isAnimated(printMode);
  const data = months.map((m) => ({ month: m.month, ...m.values }));
  return (
    <ChartCard
      title="Con quién gastas, mes a mes"
      table={{
        columns: ['Mes', ...series.map(seriesLabel)],
        rows: empty
          ? []
          : months.map((m) => [
              formatMonthYear(m.month),
              ...series.map((s) => formatCOP(m.values[s.key] ?? 0)),
            ]),
      }}
    >
      {empty ? (
        <ChartEmpty>{EMPTY_WHO}</ChartEmpty>
      ) : (
        <ChartFrame printMode={printMode} height={260}>
          {(size) => (
            <BarChart {...size} data={data} accessibilityLayer={false}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="month"
                tickFormatter={monthTickFormatter(report.period.months)}
                tick={AXIS_TICK}
                stroke={GRID_STROKE}
              />
              <YAxis tickFormatter={axisMoney} tick={AXIS_TICK} width={64} stroke={GRID_STROKE} />
              <Tooltip
                formatter={tooltipMoney}
                labelFormatter={(label) => formatMonthYear(String(label))}
                cursor={{ fill: 'var(--surface-2)' }}
                {...TOOLTIP_STYLE}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={seriesLabel(s)}
                  stackId="who"
                  fill={seriesFill(s, i)}
                  isAnimationActive={animate}
                />
              ))}
            </BarChart>
          )}
        </ChartFrame>
      )}
    </ChartCard>
  );
}
```

En `ReportCharts.tsx`, importar los dos componentes y renderizarlos después de `<CategoryBarsChart … />`:

```tsx
      <CompanionBarsChart report={report} printMode={printMode} />
      <CompanionMonthsChart report={report} printMode={printMode} />
```

Actualizar el comentario a `/** Los 10 gráficos del reporte (spec Fase 3 §5.1 y con quién §4.3). Chunk diferido: ReportsPage lo carga con React.lazy. */`.

- [ ] **Step 3: Correr, construir y medir**

Run: `npm test -w @finanzas/web`
Expected: PASS.
Run: `npm run build -w @finanzas/web && npm run check:bundle -w @finanzas/web`
Expected: OK. La carga inicial no cambia respecto de la Tarea 1, porque los gráficos están en el chunk `charts`.
Run (raíz): `npm run typecheck` y `npm run format:check`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/reports/charts
git commit -m "feat: agrega las gráficas de gastos por compañía, en total y mes a mes"
```

---

### Task 5: Punta a punta y README

**Files:**
- Modify: `e2e/tests/helpers.ts` (`addExpense`)
- Modify: `e2e/tests/signup.spec.ts`
- Modify: `e2e/tests/reports.spec.ts`
- Modify: `e2e/tests/accessibility.spec.ts`
- Modify: `README.md` (sección "Qué hace")

**Interfaces:**
- Consumes: todo lo anterior. La app de Docker `finanzas-local` aplica la migración nueva al arrancar.
- Produces: `addExpense(page, amount, category, companion?)`.

- [ ] **Step 1: Ayudante y recorridos**

En `e2e/tests/helpers.ts`, reemplazar `addExpense` por:

```ts
/** Registra un gasto pagado con la primera cuenta. `amount` en pesos, sin puntos; `companion` es "¿Con quién?" (opcional). */
export async function addExpense(page: Page, amount: string, category: string, companion?: string) {
  const sheet = await openExpense(page);
  await sheet.getByLabel('Valor').fill(amount);
  await sheet.getByRole('radio', { name: new RegExp(category) }).click();
  if (companion) {
    const option = sheet.getByRole('button', { name: companion, exact: true });
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
  }
  await sheet.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(sheet).toBeHidden();
}
```

En `e2e/tests/signup.spec.ts`:
- `await addExpense(page, '50000', 'Alimentación');` pasa a `await addExpense(page, '50000', 'Alimentación', 'Amigos');`;
- al final del test, agregar:

```ts
  // Con quién (spec con quién §3.2): la fila del gasto lo muestra.
  await page.goto('/transactions');
  await expect(page.getByRole('img', { name: 'Con Amigos' })).toBeVisible();
```

En `e2e/tests/reports.spec.ts`:
- `await addExpense(page, '35000', 'Transporte');` pasa a `await addExpense(page, '35000', 'Transporte', 'Amigos');`;
- justo después de `await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();`, agregar:

```ts
  // Con quién (spec con quién §4.3): "Este mes" ya muestra el gasto con Amigos.
  const who = page.getByRole('region', { name: 'Gastos por compañía' });
  await who.getByRole('button', { name: 'Ver tabla' }).click();
  await expect(who.getByRole('row', { name: /Amigos/ })).toContainText('$35.000');
```

En `e2e/tests/accessibility.spec.ts`, en `PAGES`, agregar `{ path: '/categories?tab=companions', heading: 'Categorías' },` después de `/reports`.

- [ ] **Step 2: README**

En `README.md`, sección "Qué hace":

1. Después de la línea "- Historial con búsqueda, filtros …", agregar:

```markdown
- **¿Con quién?**: al registrar un gasto o una compra con tarjeta puedes marcar con quién lo hiciste: Solo, Pareja, Familia, Amigos u opciones propias, que se editan en Categorías → Con quién. Reportes muestra cuánto gastas con cada una, en total y mes a mes.
```

2. En esa misma línea de Historial, la lista de filtros pasa a `(fecha, tipo, cuenta, tarjeta, categoría, con quién, etiqueta, método, valor)`.
3. En "**Reportes**", después de "gastos por categoría y por método de pago,", agregar "gastos por compañía y con quién gastas mes a mes,".
4. En "**Exportar**", la lista de hojas pasa a "(hojas Resumen, Movimientos, Por categoría, Por compañía y Por cuenta)". Antes de "Hasta 20.000 movimientos", agregar la frase: "El CSV y la hoja Movimientos incluyen la columna «Con quién».".

- [ ] **Step 3: Correr los recorridos**

Run (raíz, con Docker en marcha): `npm run e2e`
Expected: 6/6 PASS. Los recorridos de axe, en claro y oscuro, incluyen `/categories?tab=companions` sin violaciones graves.

Si la ejecución se corta, cerrar con `npm run e2e:down`, que hace `docker compose down` sin `-v`. Nunca tocar `finanzas-dev`. Si axe encuentra un contraste insuficiente en un componente nuevo, corregir el componente, no la regla.

- [ ] **Step 4: Verificación completa**

Run (raíz):
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run build -w @finanzas/web && npm run check:bundle -w @finanzas/web`

Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests README.md
git commit -m "test: cubre con quién en los recorridos de punta a punta y lo documenta en el README"
```
