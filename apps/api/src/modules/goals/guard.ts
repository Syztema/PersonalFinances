import { progressOf } from '../../domain/goals';
import type { Prisma } from '../../generated/prisma/client';
import { num } from '../../lib/db';
import { badRequest, conflict, notFound, type AppError } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

export interface LockedGoal {
  accountId: string;
  /** Avance al bloquearla (inicial + abonos − retiros). */
  progress: number;
}

export interface GoalFlows {
  contributed: number;
  withdrawn: number;
}

/** Spec 8.10: abono = transferencia con `goalId` que entra a la cuenta de la meta; retiro = la que sale. */
export async function goalFlows(
  db: DbClient,
  userId: string,
  goals: Array<{ id: string; accountId: string }>,
): Promise<Map<string, GoalFlows>> {
  const flows = new Map<string, GoalFlows>(
    goals.map((g) => [g.id, { contributed: 0, withdrawn: 0 }]),
  );
  if (goals.length === 0) return flows;
  const accountOf = new Map(goals.map((g) => [g.id, g.accountId]));
  const rows = await db.transaction.groupBy({
    by: ['goalId', 'toAccountId'],
    where: { userId, type: 'TRANSFER', goalId: { in: goals.map((g) => g.id) } },
    _sum: { amount: true },
  });
  for (const r of rows) {
    const f = r.goalId ? flows.get(r.goalId) : undefined;
    if (!f) continue;
    if (r.toAccountId === accountOf.get(r.goalId!)) f.contributed += num(r._sum.amount);
    else f.withdrawn += num(r._sum.amount);
  }
  return flows;
}

async function goalNow(db: DbClient, userId: string, id: string): Promise<LockedGoal | null> {
  const goal = await db.goal.findUnique({
    where: { id_userId: { id, userId } },
    select: { id: true, accountId: true, initialAmount: true },
  });
  if (!goal) return null;
  const { contributed, withdrawn } = (await goalFlows(db, userId, [goal])).get(id)!;
  return {
    accountId: goal.accountId,
    progress: progressOf(num(goal.initialAmount), contributed, withdrawn),
  };
}

/**
 * Spec Fase 3 §8.2: bloquea las metas (`SELECT … FOR UPDATE`, en orden de id para no
 * interbloquear) hasta el final de la transacción y devuelve su avance. Las que no existen se omiten.
 */
export async function lockGoals(
  tx: Prisma.TransactionClient,
  userId: string,
  goalIds: Array<string | null | undefined>,
): Promise<Map<string, LockedGoal>> {
  const ids = [...new Set(goalIds.filter((id): id is string => !!id))].sort();
  const locked = new Map<string, LockedGoal>();
  for (const id of ids) {
    await tx.$queryRaw`SELECT id FROM "Goal" WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
    const goal = await goalNow(tx, userId, id);
    if (goal) locked.set(id, goal);
  }
  return locked;
}

/**
 * Después de escribir: si el avance de una meta bloqueada bajó y quedó por debajo de 0, falla (y la
 * transacción se deshace). Una meta que ya estaba negativa puede subir o quedarse igual.
 */
export async function assertGoalsNotNegative(
  tx: Prisma.TransactionClient,
  userId: string,
  locked: Map<string, LockedGoal>,
  error: () => AppError,
): Promise<void> {
  for (const [id, before] of locked) {
    const after = await goalNow(tx, userId, id);
    if (after && after.progress < 0 && after.progress < before.progress) throw error();
  }
}

/**
 * Después de bloquear las metas: bloquea y relee el movimiento. Si lo borraron, 404; si una edición
 * concurrente le cambió la meta, las metas bloqueadas ya no son las correctas y hay que reintentar.
 * Siempre se bloquean las metas antes que el movimiento (mismo orden en todas las rutas).
 */
export async function relockMovement(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
  expectedGoalId: string | null,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ goalId: string | null }>>`
    SELECT "goalId" FROM "Transaction" WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound('Movimiento no encontrado.');
  if ((rows[0]!.goalId ?? null) !== expectedGoalId) {
    throw conflict('CONFLICT_RETRY', 'Este movimiento cambió; vuelve a cargarlo.');
  }
}

/** Con la meta ya bloqueada: la transferencia debe entrar o salir de su cuenta actual. */
export function assertGoalAccount(
  locked: Map<string, LockedGoal>,
  goalId: string,
  accountId: string,
  toAccountId: string,
): void {
  const goal = locked.get(goalId);
  if (!goal || (goal.accountId !== accountId && goal.accountId !== toAccountId)) {
    throw badRequest(
      'INVALID_REFERENCE',
      'Revisa las cuentas, tarjetas o categorías seleccionadas.',
      {
        goalId: goal
          ? 'La transferencia debe entrar o salir de la cuenta de la meta'
          : 'Meta no encontrada',
      },
    );
  }
}

export const withdrawalExceedsGoal = () =>
  badRequest('WITHDRAWAL_EXCEEDS_GOAL', 'Revisa los datos ingresados.', {
    amount: 'No puedes retirar más de lo ahorrado en esta meta',
  });

export const goalProgressNegative = () =>
  conflict(
    'GOAL_PROGRESS_NEGATIVE',
    'Esta meta quedaría con saldo negativo; ajusta primero sus retiros.',
  );
