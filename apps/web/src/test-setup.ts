import '@testing-library/jest-dom/vitest';
import { onlineManager } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom no trae ResizeObserver y ResponsiveContainer de Recharts lo usa (en jsdom no llega a medir).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

afterEach(() => {
  cleanup();
  // Cada test empieza con red (setOnline de test-utils la cambia).
  Reflect.deleteProperty(window.navigator, 'onLine');
  onlineManager.setOnline(true);
});
