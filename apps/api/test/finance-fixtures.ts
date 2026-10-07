import type { Client } from './helpers';

type Cat = { id: string; name: string; kind: string; systemKey: string | null };

/** Bancolombia $2.000.000, Nequi $0, Ahorro $0, Efectivo $100.000, Nu Crédito (cupo $5.000.000, corte 15, pago 30), préstamo $8.000.000. */
export async function setupFinances(api: Client) {
  const account = async (name: string, type: string, initialBalance = 0) =>
    (await api.post('/api/accounts', { name, type, initialBalance })).body.account.id as string;

  const bank = await account('Bancolombia', 'BANK', 2_000_000);
  const wallet = await account('Nequi', 'DIGITAL_WALLET');
  const savings = await account('Bolsillo ahorro', 'SAVINGS');
  const cash = await account('Efectivo', 'CASH', 100_000);
  const card = (
    await api.post('/api/credit-cards', {
      name: 'Nu Crédito',
      creditLimit: 5_000_000,
      statementDay: 15,
      paymentDueDay: 30,
    })
  ).body.card.id as string;
  const debt = (
    await api.post('/api/debts', {
      name: 'Libre inversión',
      initialBalance: 8_000_000,
      monthlyPayment: 450_000,
      paymentDay: 5,
    })
  ).body.debt.id as string;
  const categories = (await api.get('/api/categories')).body.items as Cat[];
  const byName = (name: string, kind: string) =>
    categories.find((c) => c.name === name && c.kind === kind)!.id;
  return {
    bank,
    wallet,
    savings,
    cash,
    card,
    debt,
    cat: {
      food: byName('Alimentación', 'EXPENSE'),
      fun: byName('Entretenimiento', 'EXPENSE'),
      salary: byName('Salario', 'INCOME'),
      interest: categories.find((c) => c.systemKey === 'INTEREST')!.id,
    },
  };
}

export async function balanceOf(api: Client, accountId: string): Promise<number> {
  return (await api.get(`/api/accounts/${accountId}`)).body.account.balance;
}

export async function cardOf(api: Client, cardId: string) {
  return (await api.get(`/api/credit-cards/${cardId}`)).body.card as {
    debt: number;
    available: number;
    amountDue: number;
  };
}
