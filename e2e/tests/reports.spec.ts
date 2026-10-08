import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addExpense, createAccount, registerUser } from './helpers';

/** Hoy en Bogotá (AAAA-MM-DD): la API resuelve los periodos con esa fecha. */
function todayInBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/** Día 1 del mes `back` meses antes del de `date`. */
function monthStartBack(date: string, back: number): string {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1 - back, 1)).toISOString().slice(0, 10);
}

test('reports: change the period and export a non-empty Excel file', async ({ page }) => {
  await registerUser(page, 'reports');
  await createAccount(page, 'Cuenta e2e', '1000000');
  await addExpense(page, '35000', 'Transporte');

  await page.getByRole('link', { name: 'Más', exact: true }).click();
  await page.getByRole('link', { name: 'Reportes', exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole('heading', { name: 'Reportes', level: 1 })).toBeVisible();

  // Los periodos son un grupo de opción (Chips): cada uno es un radio.
  const threeMonths = page.getByRole('radio', { name: '3 meses' });
  await threeMonths.click();
  await expect(threeMonths).toHaveAttribute('aria-checked', 'true');
  const excel = page.getByRole('button', { name: 'Exportar Excel' });
  await expect(excel).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), excel.click()]);

  // "3 meses" va del día 1 del mes de hace dos meses hasta hoy.
  const today = todayInBogota();
  expect(download.suggestedFilename()).toBe(
    `finanzas-reporte-${monthStartBack(today, 2)}_${today}.xlsx`,
  );
  // Un .xlsx es un ZIP: no vacío y con la firma PK\x03\x04 al comienzo.
  const file = readFileSync(await download.path());
  expect(file.length).toBeGreaterThan(0);
  expect([...file.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  // La descarga no navega: el periodo nunca queda en la URL.
  await expect(page).toHaveURL(/\/reports$/);
});
