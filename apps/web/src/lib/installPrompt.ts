import { useSyncExternalStore } from 'react';

/** Evento `beforeinstallprompt` de Chromium (no está en lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/**
 * Spec Fase 3 §6: guarda `beforeinstallprompt` para ofrecer "Instalar Finanzas" en Perfil. Se llama una
 * vez en main.tsx porque el navegador lo dispara al cargar, antes de que el usuario abra Perfil.
 */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** iPhone o iPad (iPadOS se presenta como Mac con pantalla táctil). */
function detectIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** La app ya corre instalada. */
function detectStandalone(): boolean {
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return displayMode || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useInstallPrompt(): {
  canInstall: boolean;
  install(): Promise<void>;
  isIos: boolean;
  isStandalone: boolean;
} {
  const event = useSyncExternalStore(
    subscribe,
    () => deferred,
    () => null,
  );
  const isStandalone = detectStandalone();
  return {
    canInstall: event !== null && !isStandalone,
    isIos: detectIos(),
    isStandalone,
    install: async () => {
      const prompt = deferred;
      if (!prompt) return;
      // El navegador permite usar el evento una sola vez.
      deferred = null;
      notify();
      await prompt.prompt();
      await prompt.userChoice;
    },
  };
}
