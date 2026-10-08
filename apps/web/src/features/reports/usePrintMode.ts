import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Spec §5.3: el modo impresión se activa antes de que el navegador tome la "foto" de la página.
 * El botón lo activa con `flushSync` y luego llama a `window.print()`; Ctrl+P pasa por `beforeprint`.
 */
export function usePrintMode(): { printMode: boolean; print(): void } {
  const [printMode, setPrintMode] = useState(false);
  useEffect(() => {
    const on = () => flushSync(() => setPrintMode(true));
    const off = () => setPrintMode(false);
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);
  const print = useCallback(() => {
    flushSync(() => setPrintMode(true));
    window.print();
  }, []);
  return { printMode, print };
}
