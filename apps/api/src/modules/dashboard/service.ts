import { endOfMonth, monthKey, startOfMonth, type DashboardDTO } from '@finanzas/shared';
import { estimateAvailable } from '../../domain/available';
import { monthFlows, summarizeDebts, summarizeMoney } from '../../domain/balances';
import { savingsReserve } from '../../domain/savings';
import type { PrismaClient } from '../../generated/prisma/client';
import { num, toDbDate } from '../../lib/db';
import type { AuthContext } from '../../types/fastify';
import { listAccounts } from '../accounts/service';
import { listCreditCards } from '../credit-cards/service';
import { listDebts } from '../debts/service';
import { ledgerEntries } from '../ledger/repository';

export async function getDashboard(db: PrismaClient, auth: AuthContext): Promise<DashboardDTO> {
  const { userId, today } = auth;
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const [user, config, accounts, monthEntries, cards, loans, obligations] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    db.financialConfiguration.findUniqueOrThrow({ where: { userId } }),
    listAccounts(db, userId),
    ledgerEntries(db, userId, { from: monthStart, to: monthEnd }),
    listCreditCards(db, userId, today),
    listDebts(db, userId, today),
    db.scheduledItem.aggregate({
      where: { userId, kind: 'EXPENSE', status: 'PENDING', dueDate: { lte: toDbDate(monthEnd) } },
      _sum: { amount: true },
    }),
  ]);

  const money = summarizeMoney(accounts);
  const flows = monthFlows(monthEntries, new Map(accounts.map((a) => [a.id, a.type])));
  const reserve = savingsReserve({
    savingsPct: config.savingsPct,
    investmentPct: config.investmentPct,
    incomeReceived: flows.income,
    savingsFlow: flows.savings,
    investmentFlow: flows.investment,
  });
  const available = estimateAvailable({
    liquid: money.liquid,
    pendingObligations: num(obligations._sum.amount),
    cardsCommitted: cards.reduce((s, c) => s + c.committed, 0),
    loansDue: loans.reduce((s, l) => s + l.installmentDue, 0),
    reserve,
  });
  const debts = summarizeDebts(
    cards.map((c) => c.debt),
    loans.map((l) => l.balance),
  );

  return {
    greetingName: user.name.trim().split(/\s+/)[0] ?? user.name,
    today,
    month: monthKey(today),
    money: { ...money, accounts: accounts.filter((a) => a.isActive) },
    available,
    debts,
    netWorth: money.total - debts.total,
    thisMonth: {
      ...flows,
      savingsRate: flows.income > 0 ? flows.savings / flows.income : null,
      savingsTargetPct: config.savingsPct,
    },
    cards: cards.filter((c) => c.isActive),
    loans: loans.filter((l) => l.isActive),
  };
}
