import type { Theme } from '@finanzas/shared';
import { useEffect } from 'react';

export const THEME_KEY = 'fz:theme';
const BROWSER_COLOR = { dark: '#0b1016', light: '#f5f6f8' };
const QUERY = '(prefers-color-scheme: dark)';

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'LIGHT' || value === 'SYSTEM' ? value : 'DARK';
  } catch {
    return 'DARK';
  }
}

export function isDark(theme: Theme): boolean {
  if (theme === 'DARK') return true;
  if (theme === 'LIGHT') return false;
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/** Misma lógica que public/theme-init.js; además recuerda la elección en este dispositivo. */
export function applyTheme(theme: Theme): void {
  const dark = isDark(theme);
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? BROWSER_COLOR.dark : BROWSER_COLOR.light);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // sin almacenamiento: el tema se aplica igual en esta visita
  }
}

/** Aplica el tema del usuario y, si es "Según el sistema", sigue los cambios del sistema. */
export function useThemeSync(theme: Theme | undefined): void {
  useEffect(() => {
    if (!theme) return;
    applyTheme(theme);
    if (theme !== 'SYSTEM' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(QUERY);
    const onChange = () => applyTheme('SYSTEM');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);
}
