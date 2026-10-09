import { expect, test, type Page } from '@playwright/test';
import { addExpense, createAccount, registerUser } from './helpers';

/** Tarjeta del dashboard por su título (las tarjetas son `<section>` con un `<h2>`). */
const card = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('sign up, create an account and an expense: the dashboard shows both', async ({ page }) => {
  await registerUser(page, 'signup');
  await expect(page.getByText('Crea tu primera cuenta')).toBeVisible();
  await page.getByRole('link', { name: 'Agregar cuenta' }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await createAccount(page, 'Bancolombia e2e', '2000000');

  await addExpense(page, '50000', 'Alimentación', 'Amigos');

  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Prueba' })).toBeVisible();
  // Mi dinero: la fila de la cuenta ya tiene descontado el gasto.
  const account = card(page, 'Mi dinero').getByRole('listitem').filter({
    hasText: 'Bancolombia e2e',
  });
  await expect(account).toContainText('$1.950.000');
  // Este mes: la fila de Gastos muestra el gasto registrado.
  const expenses = card(page, 'Este mes')
    .locator('div')
    .filter({ has: page.locator('dt', { hasText: /^Gastos$/ }) });
  await expect(expenses.locator('dd')).toHaveText('-$50.000');

  // Con quién (spec con quién §3.2): la fila del gasto lo muestra.
  await page.goto('/transactions');
  await expect(page.getByRole('img', { name: 'Con Amigos' })).toBeVisible();
});
