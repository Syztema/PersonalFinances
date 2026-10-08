// Reemplaza `virtual:pwa-register/react` en Vitest (vite.config.ts → test.alias).
import { useState } from 'react';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

/** Registro simulado: los tests lo preparan con `resetSwStub` y leen lo que la app le pasó. */
export const swStub = {
  needRefresh: false,
  options: null as RegisterSWOptions | null,
  updateCalls: [] as Array<boolean | undefined>,
};

export function resetSwStub({ needRefresh = false }: { needRefresh?: boolean } = {}) {
  swStub.needRefresh = needRefresh;
  swStub.options = null;
  swStub.updateCalls = [];
}

export function useRegisterSW(options: RegisterSWOptions = {}) {
  swStub.options = options;
  const needRefresh = useState(swStub.needRefresh);
  const offlineReady = useState(false);
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: async (reloadPage?: boolean) => {
      swStub.updateCalls.push(reloadPage);
    },
  };
}
