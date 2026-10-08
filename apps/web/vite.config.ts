import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Spec Fase 3 §6.
    VitePWA({
      registerType: 'prompt',
      // Sin script en index.html: registra UpdatePrompt (virtual:pwa-register/react); la CSP no cambia.
      injectRegister: false,
      manifest: {
        name: 'Finanzas',
        short_name: 'Finanzas',
        description: 'Control de finanzas personales en pesos colombianos',
        lang: 'es-CO',
        display: 'standalone',
        start_url: '/dashboard',
        scope: '/',
        theme_color: '#0b1016',
        background_color: '#0b1016',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Solo la interfaz. Sin runtimeCaching: nada de /api se guarda.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    // El Origin del navegador (http://localhost:5173) coincide con APP_URL de la API en desarrollo.
    proxy: { '/api': { target: 'http://localhost:3000' } },
  },
  build: {
    target: 'es2022',
    // dist/.vite/manifest.json: lo lee scripts/check-bundle.mjs.
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // React y clsx los usa la entrada; con más prioridad, Recharts no los arrastra a "charts".
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|clsx)[\\/]/,
              priority: 3,
            },
            // Registro de la PWA (Tarea 4) sin sus dependencias, que ya están en la entrada.
            {
              name: 'pwa',
              test: /virtual:pwa-register|node_modules[\\/]workbox-window[\\/]/,
              includeDependenciesRecursively: false,
              priority: 2,
            },
            // Recharts (Tarea 6) y sus dependencias (d3 vía victory-vendor, redux, immer…).
            {
              name: 'charts',
              test: /node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+)[\\/]/,
              priority: 1,
            },
            // Todo lo que carga la entrada, en un solo chunk: menos archivos y menos gzip duplicado.
            { name: 'app', tags: ['$initial'] },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    // El módulo virtual del plugin no existe en Vitest: se reemplaza por un registro simulado.
    alias: { 'virtual:pwa-register/react': '/src/test/pwaRegisterStub.ts' },
  },
});
