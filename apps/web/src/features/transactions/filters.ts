import {
  addMonths,
  endOfMonth,
  startOfMonth,
  type DerivedMethod,
  type IsoDate,
  type TransactionType,
} from '@finanzas/shared';

export interface TxFilters {
  period: 'all' | 'this-month' | 'last-month' | 'custom';
  from: IsoDate | '';
  to: IsoDate | '';
  types: TransactionType[];
  accountId: string;
  creditCardId: string;
  categoryId: string;
  companionId: string;
  tag: string;
  method: DerivedMethod | '';
  minAmount: number | null;
  maxAmount: number | null;
}

export const EMPTY_FILTERS: TxFilters = {
  period: 'all',
  from: '',
  to: '',
  types: [],
  accountId: '',
  creditCardId: '',
  categoryId: '',
  companionId: '',
  tag: '',
  method: '',
  minAmount: null,
  maxAmount: null,
};

export function activeFilterCount(f: TxFilters): number {
  return [
    f.period !== 'all',
    f.types.length > 0,
    !!f.accountId,
    !!f.creditCardId,
    !!f.categoryId,
    !!f.companionId,
    !!f.tag,
    !!f.method,
    f.minAmount !== null || f.maxAmount !== null,
  ].filter(Boolean).length;
}

function range(f: TxFilters, today: IsoDate): [string, string] {
  switch (f.period) {
    case 'this-month':
      return [startOfMonth(today), today];
    case 'last-month': {
      const previous = addMonths(startOfMonth(today), -1);
      return [previous, endOfMonth(previous)];
    }
    case 'custom':
      return [f.from, f.to];
    default:
      return ['', ''];
  }
}

/** Parámetros de la petición a la API (no se reflejan en la URL del navegador). */
export function filtersToParams(f: TxFilters, q: string, today: IsoDate): URLSearchParams {
  const params = new URLSearchParams({ limit: '30' });
  const [from, to] = range(f, today);
  const set = (key: string, value: string | number | null) => {
    if (value !== null && value !== '') params.set(key, String(value));
  };
  set('from', from);
  set('to', to);
  set('type', f.types.join(','));
  set('accountId', f.accountId);
  set('creditCardId', f.creditCardId);
  set('categoryId', f.categoryId);
  set('companionId', f.companionId);
  set('tag', f.tag);
  set('method', f.method);
  set('minAmount', f.minAmount);
  set('maxAmount', f.maxAmount);
  set('q', q);
  return params;
}

export function groupByDate<T extends { date: IsoDate }>(
  items: T[],
): Array<{ date: IsoDate; items: T[] }> {
  const groups: Array<{ date: IsoDate; items: T[] }> = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, items: [item] });
  }
  return groups;
}
