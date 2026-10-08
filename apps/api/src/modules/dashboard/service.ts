import { monthKey, roundShare, type DashboardDTO } from '@finanzas/shared';
import { summarizeDebts } from '../../domain/balances';
import type { PrismaClient } from '../../generated/prisma/client';
import type { AuthContext } from '../../types/fastify';
import { activeAlerts, planningStatus } from '../alerts/service';
import { listGoals } from '../goals/service';
import { loadPlanning } from '../planning/snapshot';

export async function getDashboard(db: PrismaClient, auth: AuthContext): Promise<DashboardDTO> {
  const snap = await loadPlanning(db, auth);
  const [user, alerts, goals] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { name: true } }),
    activeAlerts(db, auth, snap),
    listGoals(db, auth),
  ]);
  const debts = summarizeDebts(
    snap.cards.map((c) => c.debt),
    snap.loans.map((l) => l.balance),
  );
  const total = snap.budget.dto.total;
  const { endOfMonthBalance: _endOfMonthBalance, ...spendingPower } = snap.spendingPower;

  return {
    greetingName: user.name.trim().split(/\s+/)[0] ?? user.name,
    today: auth.today,
    month: monthKey(auth.today),
    money: { ...snap.money, accounts: snap.accounts.filter((a) => a.isActive) },
    available: snap.available,
    debts,
    netWorth: snap.money.total - debts.total,
    thisMonth: {
      ...snap.flows,
      savingsRate:
        snap.flows.income > 0 ? roundShare(snap.flows.savings / snap.flows.income) : null,
      savingsTargetPct: snap.config.savingsPct,
    },
    cards: snap.cards.filter((c) => c.isActive),
    loans: snap.loans.filter((l) => l.isActive),
    spendingPower,
    status: planningStatus(snap),
    alerts: alerts.slice(0, 3),
    goals: goals.filter((g) => g.status === 'ACTIVE').slice(0, 3),
    budget: total
      ? {
          budget: total.budget,
          spent: total.spent,
          usage: total.usage,
          projectionExceedsOnDay: snap.budget.dto.projection?.exceedsOnDay ?? null,
        }
      : null,
  };
}
