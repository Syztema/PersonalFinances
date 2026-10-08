import { expect, test } from '@playwright/test';
import { createAccount, registerUser } from './helpers';

test('paying an obligation creates one movement and lowers the account once', async ({ page }) => {
  await registerUser(page, 'obligation');
  await createAccount(page, 'Banco e2e', '3000000');

  await page.goto('/recurring');
  await page.getByRole('button', { name: 'Nuevo pago único' }).click();
  const form = page.getByRole('dialog', { name: 'Pago único o ingreso esperado' });
  await form.getByLabel('Nombre', { exact: true }).fill('Arriendo e2e');
  await form.getByLabel('Valor').fill('1200000');
  await form.getByLabel('Categoría').selectOption({ label: 'Vivienda' });
  await form.getByLabel('Cuenta o tarjeta').selectOption({ label: 'Banco e2e' });
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();

  await page.getByRole('button', { name: 'Pagar Arriendo e2e' }).click();
  const pay = page.getByRole('dialog', { name: 'Pagar Arriendo e2e' });
  await pay.getByRole('button', { name: 'Guardar pago' }).dblclick();
  await expect(pay).toBeHidden();

  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
  await expect(page.getByText('Arriendo e2e', { exact: true })).toHaveCount(1);
  // La fila del movimiento (un botón que abre su detalle) lleva el valor pagado como gasto.
  await expect(page.getByRole('button', { name: /Arriendo e2e/ })).toContainText('-$1.200.000');

  await page.goto('/accounts');
  await expect(page.getByRole('button', { name: /Banco e2e/ })).toContainText('$1.800.000');
});
