import { defineConfig } from '@playwright/test';

/** Spec §9.4: Chromium en un celular de 360 × 800 contra el Docker de despliegue (npm run e2e). */
export default defineConfig({
  testDir: './tests',
  // Un solo stack de Docker para todos: los recorridos van en serie (cada uno con su usuario).
  // Todas las peticiones salen de la misma IP y la API limita a 300 por minuto por IP: una corrida
  // hace ~155. `--repeat-each` o muchos más recorridos llegan al límite ("Demasiadas solicitudes").
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:8080',
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
});
