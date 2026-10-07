import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-9" />
          <span className="text-xl font-semibold">Finanzas</span>
        </div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
        <div className="mt-6 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-border">
          {children}
        </div>
      </div>
    </main>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        'mb-4 rounded-xl px-3 py-2 text-sm',
        tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary',
      )}
    >
      {children}
    </p>
  );
}
