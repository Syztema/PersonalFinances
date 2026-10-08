import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addExpense, createAccount, registerUser } from './helpers';

type Theme = 'Claro' | 'Oscuro';

const PAGES: Array<{ path: string; heading: string | RegExp }> = [
  { path: '/dashboard', heading: 'Hola, Prueba' },
  { path: '/transactions', heading: 'Movimientos' },
  { path: '/budgets', heading: 'Presupuestos' },
  { path: '/reports', heading: 'Reportes' },
  { path: '/profile', heading: 'Perfil y seguridad' },
];

/** Spec §7.1: cero violaciones `serious` o `critical` de WCAG 2.1 A/AA. */
async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** El tema se guarda en el perfil: así lo aplican theme-init.js y la app en cada recarga. */
async function chooseTheme(page: Page, label: Theme) {
  await page.goto('/profile');
  const option = page.getByRole('radio', { name: label });
  // La interfaz cambia antes de que responda el servidor: se espera el PATCH para que el siguiente
  // `goto` no lo corte (si no, useThemeSync volvería al tema anterior que sigue en el servidor).
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith('/api/me') && res.request().method() === 'PATCH' && res.ok(),
    ),
    option.click(),
  ]);
  await expect(option).toHaveAttribute('aria-checked', 'true');
}

/** Lo que se carga después del primer pintado también pasa por axe: secciones y gráficos diferidos. */
async function waitForDeferredContent(page: Page, path: string) {
  if (path === '/dashboard') {
    // "Tus últimos 6 meses" pide sus datos y su chunk de gráficos solo al entrar en pantalla.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const recent = page.getByRole('region', { name: 'Tus últimos 6 meses' });
    await expect(recent.getByRole('region', { name: 'Ingresos vs. gastos' })).toBeVisible();
    await expect(recent.locator('svg.recharts-surface').first()).toBeVisible();
    await expect(recent.getByRole('status')).toHaveCount(0);
  }
  if (path === '/reports') {
    // Los gráficos del reporte van en un chunk diferido (React.lazy).
    await expect(page.getByRole('region', { name: 'Ingresos vs. gastos' })).toBeVisible();
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible();
    await expect(page.getByRole('status', { name: /Cargando/ })).toHaveCount(0);
  }
}

for (const theme of ['Claro', 'Oscuro'] as const) {
  test(`axe finds no serious or critical violations with the ${theme} theme`, async ({ page }) => {
    await registerUser(page, `axe-${theme.toLowerCase()}`);
    await createAccount(page, 'Cuenta axe', '1500000');
    await addExpense(page, '42000', 'Alimentación');
    await chooseTheme(page, theme);

    const html = page.locator('html');
    for (const { path, heading } of PAGES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      if (theme === 'Oscuro') await expect(html).toHaveClass(/dark/);
      else await expect(html).not.toHaveClass(/dark/);
      await waitForDeferredContent(page, path);
      await page.waitForLoadState('networkidle');
      expect(await seriousViolations(page), `${path} con el tema ${theme}`).toEqual([]);
    }
  });
}
