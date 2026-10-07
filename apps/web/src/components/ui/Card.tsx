import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      {...props}
      className={cn('rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border', className)}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      {...props}
      className={cn('text-sm font-semibold tracking-wide text-muted uppercase', className)}
    />
  );
}
