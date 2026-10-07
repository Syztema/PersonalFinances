import type { Page, TransactionDTO } from '@finanzas/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { ListFilter, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState';
import { TextInput } from '../../components/ui/Field';
import { PageSpinner, Spinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { dayHeading } from '../../lib/format';
import { qk } from '../../lib/queries';
import { useDebounced } from '../../lib/useDebounced';
import { useToday } from '../auth/useAuth';
import { FiltersSheet } from './FiltersSheet';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  filtersToParams,
  groupByDate,
  type TxFilters,
} from './filters';
import { TransactionDetailSheet } from './TransactionDetailSheet';
import { TransactionRow } from './TransactionRow';

export function TransactionsPage() {
  const today = useToday();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [filters, setFilters] = useState<TxFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<TransactionDTO | null>(null);
  const params = filtersToParams(filters, q, today).toString();

  const query = useInfiniteQuery({
    queryKey: [...qk.transactions, params],
    queryFn: ({ pageParam }) =>
      api.get<Page<TransactionDTO>>(
        `/transactions?${params}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const count = activeFilterCount(filters);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Movimientos</h1>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <TextInput
            type="search"
            maxLength={80}
            aria-label="Buscar"
            placeholder="Buscar"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Button variant="secondary" onClick={() => setFiltersOpen(true)} aria-label="Filtros">
          <ListFilter size={18} />
          {count > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-fg">{count}</span>
          )}
        </Button>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={count || q ? 'No hay movimientos con esos filtros' : 'Aún no tienes movimientos'}
          description="Usa el botón + para registrar el primero."
        />
      ) : (
        <div className="space-y-4">
          {groupByDate(items).map((group) => (
            <section key={group.date}>
              <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase">
                {dayHeading(group.date, today)}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
                {group.items.map((t) => (
                  <li key={t.id}>
                    <TransactionRow transaction={t} onSelect={setSelected} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div ref={sentinel} className="flex justify-center py-2">
            {isFetchingNextPage ? (
              <Spinner />
            ) : hasNextPage ? (
              <Button variant="ghost" onClick={() => void fetchNextPage()}>
                Cargar más
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        value={filters}
        onApply={setFilters}
      />
      <TransactionDetailSheet transaction={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
