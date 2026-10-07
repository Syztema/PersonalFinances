import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'success' | 'warning' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<{ show: (t: { message: string; tone?: Tone }) => void } | null>(
  null,
);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback(({ message, tone = 'success' }: { message: string; tone?: Tone }) => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-sm text-white shadow-lg',
              t.tone === 'success' && 'bg-slate-900',
              t.tone === 'warning' && 'bg-warning',
              t.tone === 'error' && 'bg-negative',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fuera de ToastProvider');
  return ctx;
}
