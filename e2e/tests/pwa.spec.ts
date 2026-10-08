import { expect, test } from '@playwright/test';
import { createAccount, openExpense, registerUser } from './helpers';

const OFFLINE = 'Sin conexión — no se puede guardar hasta que vuelva la red';

test('PWA: valid manifest, active service worker and no saving without network', async ({
  page,
  context,
}) => {
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await res.json();
  expect(manifest).toMatchObject({
    name: 'Finanzas',
    short_name: 'Finanzas',
    lang: 'es-CO',
    display: 'standalone',
    start_url: '/dashboard',
    theme_color: '#0b1016',
    background_color: '#0b1016',
  });
  const icons: Array<{ sizes: string; purpose?: string }> = manifest.icons;
  expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(icons.some((i) => i.purpose?.includes('maskable'))).toBe(true);

  await registerUser(page, 'pwa');
  // `ready` resuelve con el worker activo aún en "activating": se espera a que termine de activarse.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state))
    .toBe('activated');

  await createAccount(page, 'Cuenta pwa', '100000');
  const sheet = await openExpense(page);
  const save = sheet.getByRole('button', { name: 'Guardar', exact: true });
  await expect(save).toBeEnabled();

  await context.setOffline(true);
  await expect(page.getByText(OFFLINE)).toBeVisible();
  await expect(save).toBeDisabled();

  await context.setOffline(false);
  await expect(page.getByText(OFFLINE)).toBeHidden();
  await expect(save).toBeEnabled();
});
