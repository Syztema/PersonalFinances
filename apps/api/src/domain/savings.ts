export const pctOf = (amount: number, pct: number) => Math.round((amount * pct) / 100);

export interface ReserveInput {
  savingsPct: number;
  investmentPct: number;
  incomeReceived: number;
  savingsFlow: number;
  investmentFlow: number;
}

/** Spec 8.5: lo que falta separar del % de los ingresos ya recibidos este mes. */
export function savingsReserve(i: ReserveInput): number {
  return (
    Math.max(0, pctOf(i.incomeReceived, i.savingsPct) - i.savingsFlow) +
    Math.max(0, pctOf(i.incomeReceived, i.investmentPct) - i.investmentFlow)
  );
}
