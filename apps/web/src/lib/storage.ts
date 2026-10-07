/** Solo comodidades locales; puede fallar en modo privado, por eso todo va en try/catch. */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento disponible: se ignora
  }
}

/** Comodidades locales de un usuario (no el tema): se olvidan al cerrar sesión o eliminar la cuenta. */
export const LAST_SOURCE_KEY = 'fz:lastSource';
export const CATEGORY_USE_KEY = 'fz:categoryUse';

export function clearUserLocalData(): void {
  for (const key of [LAST_SOURCE_KEY, CATEGORY_USE_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // sin almacenamiento disponible: se ignora
    }
  }
}
