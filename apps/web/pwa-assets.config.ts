import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Spec Fase 3 §6: íconos desde public/favicon.svg; se generan una vez (npm run pwa:icons) y se versionan.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Solo lo que usa el manifest (sin favicon.ico ni 64 px: el favicon sigue siendo el SVG).
    transparent: { sizes: [192, 512], favicons: [] },
    maskable: { sizes: [512], resizeOptions: { background: '#0f766e' } },
    apple: { sizes: [180], resizeOptions: { background: '#0f766e' } },
  },
  images: ['public/favicon.svg'],
});
