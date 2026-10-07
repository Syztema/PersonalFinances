import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-5 animate-spin', className)} aria-hidden />;
}

export function PageSpinner() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center text-muted"
      role="status"
      aria-label="Cargando"
    >
      <Spinner className="size-7" />
    </div>
  );
}
