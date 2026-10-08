import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'clave-e2e-segura';

/** Spec §9.4: cada recorrido usa un usuario nuevo con un email que no se repite. */
export const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Crea un usuario desde "Crea tu cuenta" y termina en el dashboard. */
export async function registerUser(page: Page, label: string) {
  await page.goto('/register');
  await page.getByLabel('Nombre', { exact: true }).fill('Prueba');
  await page.getByLabel('Email', { exact: true }).fill(uniqueEmail(label));
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Hola, Prueba' })).toBeVisible();
}

/** Crea una cuenta bancaria con su saldo de hoy desde "Mis cuentas". `balance` en pesos, sin puntos. */
export async function createAccount(page: Page, name: string, balance: string) {
  if (!page.url().endsWith('/accounts')) await page.goto('/accounts');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await sheet.getByLabel('Nombre', { exact: true }).fill(name);
  await sheet.getByLabel('Saldo actual').fill(balance);
  await sheet.getByRole('button', { name: 'Guardar cuenta' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
}

/** Abre el registro rápido de un gasto con el botón "+" de la barra inferior. */
export async function openExpense(page: Page) {
  await page.getByRole('button', { name: 'Agregar movimiento' }).click();
  await page.getByRole('button', { name: /^Gasto/ }).click();
  return page.getByRole('dialog', { name: 'Nuevo gasto' });
}

/** Registra un gasto pagado con la primera cuenta. `amount` en pesos, sin puntos. */
export async function addExpense(page: Page, amount: string, category: string) {
  const sheet = await openExpense(page);
  await sheet.getByLabel('Valor').fill(amount);
  await sheet.getByRole('radio', { name: new RegExp(category) }).click();
  await sheet.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(sheet).toBeHidden();
}
