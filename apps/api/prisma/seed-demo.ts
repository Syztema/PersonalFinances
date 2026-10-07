import {
  addMonths,
  endOfMonth,
  makeDate,
  monthKey,
  startOfMonth,
  todayIn,
  yearMonth,
  type IsoDate,
  type TransactionInput,
} from '@finanzas/shared';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createAccount } from '../src/modules/accounts/service';
import { registerUser } from '../src/modules/auth/service';
import { listCategories } from '../src/modules/categories/service';
import { createCreditCard, getCreditCard } from '../src/modules/credit-cards/service';
import { createDebt } from '../src/modules/debts/service';
import { toDbDate } from '../src/lib/db';
import { putBudget } from '../src/modules/budgets/service';
import { createGoal } from '../src/modules/goals/service';
import { ensureScheduled } from '../src/modules/recurring/service';
import { createTransaction } from '../src/modules/transactions/service';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'Demo12345!';

type Event = { date: IsoDate; order: number; run: () => Promise<unknown> };

/** Tres meses de historia hasta "hoy" (Bogotá), con montos pseudoaleatorios deterministas. */
export async function seedDemo(prisma: PrismaClient, now: Date = new Date()) {
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  const user = await registerUser(
    prisma,
    { name: 'Cristian Demo', email: DEMO_EMAIL, password: DEMO_PASSWORD },
    { allowRegistration: true },
  );
  const today = todayIn(user.timezone, now);
  const start = startOfMonth(addMonths(today, -2));
  const auth = { userId: user.id, sessionId: 'seed', timezone: user.timezone, today };

  const account = (
    name: string,
    type: 'BANK' | 'DIGITAL_WALLET' | 'CASH' | 'SAVINGS',
    initialBalance: number,
    icon: string,
    color: string,
  ) =>
    createAccount(prisma, auth, {
      name,
      type,
      institution: null,
      initialBalance,
      openingDate: start,
      icon,
      color,
    });
  const bank = await account('Bancolombia', 'BANK', 2_500_000, 'landmark', '#ca8a04');
  const nequi = await account('Nequi', 'DIGITAL_WALLET', 150_000, 'smartphone', '#7c3aed');
  const cash = await account('Efectivo', 'CASH', 80_000, 'banknote', '#16a34a');
  const nu = await account('Nu', 'BANK', 400_000, 'wallet', '#8b5cf6');
  const savings = await account('Bolsillo ahorro', 'SAVINGS', 1_500_000, 'piggy-bank', '#0ea5e9');

  const card = await createCreditCard(prisma, auth, {
    name: 'Nu Crédito',
    issuer: 'Nu',
    creditLimit: 5_000_000,
    initialDebt: 0,
    initialDebtInstallments: 1,
    openingDate: start,
    statementDay: 15,
    paymentDueDay: 30,
    icon: 'credit-card',
    color: '#820ad1',
  });
  const debt = await createDebt(prisma, auth, {
    name: 'Crédito libre inversión',
    lender: 'Bancolombia',
    initialBalance: 8_000_000,
    openingDate: start,
    monthlyPayment: 450_000,
    paymentDay: 5,
    receivedInAccountId: null,
    icon: 'landmark',
    color: '#0f766e',
  });
  const goal = await createGoal(prisma, auth, {
    name: 'Comprar computador',
    targetAmount: 5_000_000,
    targetDate: '2027-06-30',
    accountId: savings.id,
    initialAmount: 1_500_000,
    icon: 'laptop',
    color: '#0ea5e9',
  });

  const categories = await listCategories(prisma, user.id);
  const cat = (name: string, kind: 'INCOME' | 'EXPENSE' = 'EXPENSE') =>
    categories.find((c) => c.name === name && c.kind === kind)!.id;

  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const between = (min: number, max: number) =>
    Math.round((min + rand() * (max - min)) / 100) * 100;

  const base = { description: null, payee: null, notes: null, tags: [] as string[] };
  const events: Event[] = [];
  const add = (date: IsoDate, order: number, input: Record<string, unknown>) => {
    if (date < start || date > today) return;
    events.push({
      date,
      order,
      run: () => createTransaction(prisma, auth, { ...base, ...input, date } as TransactionInput),
    });
  };

  for (let offset = 0; offset < 3; offset++) {
    const { year, month } = yearMonth(addMonths(start, offset));
    const day = (d: number) => makeDate(year, month, d);
    const last = endOfMonth(day(1));

    add(day(1), 1, {
      type: 'EXPENSE',
      amount: 1_000_000,
      accountId: bank.id,
      categoryId: cat('Vivienda'),
      description: 'Arriendo',
    });
    add(day(2), 1, {
      type: 'TRANSFER',
      amount: 300_000,
      accountId: bank.id,
      toAccountId: nequi.id,
      description: 'Recarga Nequi',
    });
    add(day(5), 1, {
      type: 'DEBT_PAYMENT',
      amount: 380_000,
      interest: 70_000,
      accountId: bank.id,
      debtId: debt.id,
      description: 'Cuota crédito',
    });
    add(day(9), 1, {
      type: 'TRANSFER',
      amount: 150_000,
      accountId: bank.id,
      toAccountId: cash.id,
      description: 'Retiro cajero',
    });
    add(day(10), 1, {
      type: 'EXPENSE',
      amount: 90_000,
      accountId: bank.id,
      categoryId: cat('Servicios'),
      description: 'Internet',
    });
    add(day(12), 1, {
      type: 'CARD_PURCHASE',
      amount: 38_900,
      creditCardId: card.id,
      categoryId: cat('Suscripciones'),
      installments: 1,
      description: 'Netflix',
    });
    add(day(15), 0, {
      type: 'INCOME',
      amount: 2_000_000,
      accountId: bank.id,
      categoryId: cat('Salario', 'INCOME'),
      payee: 'Empresa S.A.S.',
      description: 'Salario quincena',
    });
    add(day(16), 1, {
      type: 'TRANSFER',
      amount: 300_000,
      accountId: bank.id,
      toAccountId: nequi.id,
      description: 'Recarga Nequi',
    });
    add(day(16), 2, {
      type: 'TRANSFER',
      amount: 400_000,
      accountId: bank.id,
      toAccountId: savings.id,
      goalId: goal.id,
      description: 'Ahorro quincena',
    });
    add(day(20), 1, {
      type: 'EXPENSE',
      amount: 45_000,
      accountId: nequi.id,
      categoryId: cat('Entretenimiento'),
      description: 'Cine',
    });
    add(last, 0, {
      type: 'INCOME',
      amount: 2_000_000,
      accountId: bank.id,
      categoryId: cat('Salario', 'INCOME'),
      payee: 'Empresa S.A.S.',
      description: 'Salario quincena',
    });

    if (offset === 1) {
      add(day(8), 1, {
        type: 'CARD_PURCHASE',
        amount: 1_200_000,
        creditCardId: card.id,
        categoryId: cat('Compras'),
        installments: 12,
        description: 'Monitor',
      });
      add(day(22), 1, {
        type: 'INCOME',
        amount: 600_000,
        accountId: nu.id,
        categoryId: cat('Freelance', 'INCOME'),
        payee: 'Cliente',
        description: 'Proyecto freelance',
      });
    }

    for (let d = 3, i = 0; d <= 28; d += 7, i++) {
      const groceries = {
        amount: between(120_000, 220_000),
        categoryId: cat('Alimentación'),
        description: 'Mercado',
      };
      if (i % 2 === 0)
        add(day(d), 3, {
          type: 'CARD_PURCHASE',
          creditCardId: card.id,
          installments: 1,
          ...groceries,
        });
      else add(day(d), 3, { type: 'EXPENSE', accountId: nequi.id, ...groceries });
    }
    for (let d = 2, i = 0; d <= 28; d += 3, i++) {
      const isLunch = i % 2 === 0;
      add(day(d), 4, {
        type: 'EXPENSE',
        amount: isLunch ? between(15_000, 32_000) : between(8_000, 20_000),
        accountId: i % 3 === 0 ? cash.id : nequi.id,
        categoryId: cat(isLunch ? 'Alimentación' : 'Transporte'),
        description: isLunch ? 'Almuerzo' : 'Transporte',
      });
    }
    const paymentDate = day(28);
    if (paymentDate <= today) {
      events.push({
        date: paymentDate,
        order: 9,
        run: async () => {
          const status = await getCreditCard(prisma, user.id, card.id, paymentDate);
          const amount = Math.min(status.amountDue, status.debt);
          if (amount > 0) {
            await createTransaction(prisma, auth, {
              ...base,
              type: 'CARD_PAYMENT',
              amount,
              date: paymentDate,
              accountId: bank.id,
              creditCardId: card.id,
              description: 'Pago tarjeta Nu',
            });
          }
        },
      });
    }
  }

  events.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));
  for (const event of events) await event.run();

  await putBudget(prisma, auth, monthKey(today), {
    totalAmount: 4_200_000,
    lines: [
      { categoryId: cat('Alimentación'), amount: 900_000 },
      { categoryId: cat('Transporte'), amount: 250_000 },
      { categoryId: cat('Entretenimiento'), amount: 200_000 },
      { categoryId: cat('Servicios'), amount: 150_000 },
      { categoryId: cat('Suscripciones'), amount: 60_000 },
    ],
  });

  const { year: startYear, month: startMonth } = yearMonth(start);
  const rule = (r: {
    name: string;
    kind: 'INCOME' | 'EXPENSE';
    amount: number;
    categoryId: string;
    accountId?: string;
    creditCardId?: string;
    frequency: 'MONTHLY' | 'SEMIMONTHLY';
    day: number;
  }) =>
    prisma.recurringRule.create({
      data: {
        userId: user.id,
        name: r.name,
        kind: r.kind,
        amount: BigInt(r.amount),
        categoryId: r.categoryId,
        accountId: r.accountId ?? null,
        creditCardId: r.creditCardId ?? null,
        frequency: r.frequency,
        day1: r.frequency === 'SEMIMONTHLY' ? 15 : null,
        day2: r.frequency === 'SEMIMONTHLY' ? 31 : null,
        startDate: toDbDate(makeDate(startYear, startMonth, r.day)),
        activeFrom: toDbDate(start),
      },
    });
  await rule({
    name: 'Arriendo',
    kind: 'EXPENSE',
    amount: 1_000_000,
    categoryId: cat('Vivienda'),
    accountId: bank.id,
    frequency: 'MONTHLY',
    day: 1,
  });
  await rule({
    name: 'Internet',
    kind: 'EXPENSE',
    amount: 90_000,
    categoryId: cat('Servicios'),
    accountId: bank.id,
    frequency: 'MONTHLY',
    day: 10,
  });
  await rule({
    name: 'Netflix',
    kind: 'EXPENSE',
    amount: 38_900,
    categoryId: cat('Suscripciones'),
    creditCardId: card.id,
    frequency: 'MONTHLY',
    day: 12,
  });
  await rule({
    name: 'Salario',
    kind: 'INCOME',
    amount: 2_000_000,
    categoryId: cat('Salario', 'INCOME'),
    accountId: bank.id,
    frequency: 'SEMIMONTHLY',
    day: 15,
  });
  await ensureScheduled(prisma, user.id, today);
  await linkPastOccurrences(prisma, user.id, today);
  return { userId: user.id };
}

/** Las ocurrencias pasadas del demo ya se pagaron: se enlazan con el movimiento sembrado ese día. */
async function linkPastOccurrences(prisma: PrismaClient, userId: string, today: IsoDate) {
  const items = await prisma.scheduledItem.findMany({
    where: { userId, status: 'PENDING', dueDate: { lte: toDbDate(today) } },
  });
  for (const item of items) {
    const tx = await prisma.transaction.findFirst({
      where: {
        userId,
        categoryId: item.categoryId,
        date: item.dueDate,
        amount: item.amount,
        accountId: item.accountId,
        creditCardId: item.creditCardId,
        scheduledItem: { is: null },
      },
    });
    if (tx) {
      await prisma.scheduledItem.update({
        where: { id: item.id },
        data: { status: 'DONE', transactionId: tx.id },
      });
    }
  }
}
