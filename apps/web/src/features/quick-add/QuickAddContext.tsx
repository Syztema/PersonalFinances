import type { TransactionDTO } from '@finanzas/shared';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type QuickAddKind =
  | 'menu'
  | 'expense'
  | 'income'
  | 'transfer'
  | 'card-purchase'
  | 'card-payment'
  | 'loan-payment'
  | 'disbursement';

export interface QuickAddRequest {
  kind: QuickAddKind;
  cardId?: string;
  debtId?: string;
  edit?: TransactionDTO;
}

interface QuickAddValue {
  request: QuickAddRequest | null;
  open: (request: QuickAddRequest) => void;
  close: () => void;
}

const QuickAddCtx = createContext<QuickAddValue | null>(null);

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<QuickAddRequest | null>(null);
  const value = useMemo(
    () => ({ request, open: setRequest, close: () => setRequest(null) }),
    [request],
  );
  return <QuickAddCtx.Provider value={value}>{children}</QuickAddCtx.Provider>;
}

export function useQuickAdd() {
  const ctx = useContext(QuickAddCtx);
  if (!ctx) throw new Error('useQuickAdd fuera de QuickAddProvider');
  return ctx;
}
