import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '../../app/BottomNav';
import { Sidebar } from '../../app/Sidebar';
import { UpdatePrompt } from '../../app/UpdatePrompt';
import { Button } from '../../components/ui/Button';
import { OfflineBanner } from '../../components/ui/OfflineBanner';
import { useToast } from '../../components/ui/Toast';
import { resetSwStub } from '../../test/pwaRegisterStub';
import { makeReport } from '../../test/reportFixture';
import { renderWithProviders, setOnline } from '../../test-utils';
import { QuickAddProvider } from '../quick-add/QuickAddContext';
import { ReportsPage } from './ReportsPage';

// Se lee del disco: con `css: false`, Vitest entrega vacío cualquier import de .css (incluso ?raw).
const css = readFileSync(resolve(import.meta.dirname, '../../index.css'), 'utf8');

/** Contenido entre la llave que abre en `start` (o después) y su llave de cierre. */
function block(source: string, start: number): string {
  if (start < 0) throw new Error('No se encontró el bloque en index.css');
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('Bloque sin cerrar en index.css');
}

/** Variables `--x: valor;` declaradas directamente en un bloque. */
const tokens = (body: string) =>
  Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], (m[2] ?? '').trim()]),
  );

/** El elemento, o uno que lo contiene, no se imprime (utilidad `print:hidden` de Tailwind). */
const notPrinted = (el: Element) => el.closest('.print\\:hidden') !== null;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('print sheet (review focus #3)', () => {
  const print = block(css, css.indexOf('@media print'));
  const forcedDark = block(print, print.search(/:root\.dark\s*\{/));

  it('prints with the light tokens even when <html> has the dark class', () => {
    const light = tokens(block(css, css.search(/^:root\s*\{/m)));
    expect(light['--muted']).toBe('#5b6779');
    expect(light['--warning']).toBe('#a14a06');
    expect(Object.keys(light).length).toBeGreaterThan(10);
    // Todos los tokens de :root, con sus mismos valores; si se agrega uno, también va aquí.
    expect(tokens(forcedDark)).toEqual(light);
    expect(forcedDark).toMatch(/color-scheme:\s*light;/);
  });

  it('uses A4 pages with 12 mm margins', () => {
    const page = block(print, print.indexOf('@page'));
    expect(page).toMatch(/size:\s*A4;/);
    expect(page).toMatch(/margin:\s*12mm;/);
  });
});

describe('what is never printed (spec §5.3)', () => {
  it('hides the navigation, buttons, toasts, the offline banner and the update notice', async () => {
    function ShowToast() {
      const { show } = useToast();
      useEffect(() => show({ message: 'Guardado' }), [show]);
      return null;
    }
    resetSwStub({ needRefresh: true });
    setOnline(false);
    renderWithProviders(
      <QuickAddProvider>
        <Sidebar />
        <BottomNav />
        <OfflineBanner />
        <UpdatePrompt />
        <ShowToast />
        <Button>Reintentar</Button>
      </QuickAddProvider>,
    );
    expect(notPrinted(screen.getByRole('navigation', { name: 'Navegación principal' }))).toBe(true);
    expect(notPrinted(screen.getByRole('navigation', { name: 'Navegación' }))).toBe(true);
    expect(
      notPrinted(screen.getByText('Sin conexión — no se puede guardar hasta que vuelva la red')),
    ).toBe(true);
    expect(notPrinted(screen.getByText('Nueva versión disponible'))).toBe(true);
    expect(notPrinted(await screen.findByText('Guardado'))).toBe(true);
    expect(notPrinted(screen.getByRole('button', { name: 'Reintentar' }))).toBe(true);
  });

  it('prints Reportes without buttons, with its header and the category and account tables', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(makeReport()))),
    );
    const { container } = renderWithProviders(<ReportsPage />);
    await screen.findByRole('region', { name: 'Gastos por categoría' }, { timeout: 5000 });

    let printed: { buttons: string[]; tables: string[] } | null = null;
    vi.spyOn(window, 'print').mockImplementation(() => {
      printed = {
        // Incluye los radios del periodo y "Ver tabla": todos son <button>.
        buttons: [...container.querySelectorAll('button')]
          .filter((button) => !notPrinted(button))
          .map((button) => button.textContent ?? ''),
        tables: [...container.querySelectorAll('table caption')].map((c) => c.textContent ?? ''),
      };
    });
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir o guardar PDF' }));
    expect(printed).toEqual({
      buttons: [],
      tables: ['Gastos por categoría', 'Dónde está tu dinero'],
    });
    expect(screen.getByText(/^Finanzas — Reporte del/).closest('header')).toHaveClass(
      'hidden',
      'print:block',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Reportes' })).toHaveClass('print:hidden');
    const cards = [...container.querySelectorAll('section')];
    expect(cards).toHaveLength(9);
    for (const card of cards) expect(card).toHaveClass('break-inside-avoid');
  });
});
