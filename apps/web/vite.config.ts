import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // El Origin del navegador (http://localhost:5173) coincide con APP_URL de la API en desarrollo.
    proxy: { '/api': { target: 'http://localhost:3000' } },
  },
  build: { target: 'es2022' },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], css: false },
});
