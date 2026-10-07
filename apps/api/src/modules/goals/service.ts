import type {
  GoalContributionInput,
  GoalCreateInput,
  GoalDTO,
  GoalUpdateInput,
  GoalWithdrawalInput,
  IsoDate,
  TransactionResultDTO,
} from '@finanzas/shared';
import { goalProgress } from '../../domain/goals';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { badRequest, conflict, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { accountRefSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';
import { createTransaction } from '../transactions/service';

const goalInclude = { account: { select: accountRefSelect } } satisfies Prisma.GoalInclude;
type GoalRow = Prisma.GoalGetPayload<{ include: typeof goalInclude }>;
interface GoalFlows {
  contributed: number;
  withdrawn: number;
}

/** Abono = transferencia con goalId que entra a la cuenta de la meta; retiro = la que sale. */
async function flowsOf(db: DbClient, userId: string, goals: GoalRow[]) {
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

function toGoalDTO(g: GoalRow, f: GoalFlows, today: IsoDate): GoalDTO {
  const targetAmount = num(g.targetAmount);
  const initialAmount = num(g.initialAmount);
  const targetDate = g.targetDate ? fromDbDate(g.targetDate) : null;
  return {
    id: g.id,
    name: g.name,
    targetAmount,
    targetDate,
    account: g.account,
    initialAmount,
    status: g.status,
    icon: g.icon,
    color: g.color,
    contributed: f.contributed,
    withdrawn: f.withdrawn,
    ...goalProgress({
      targetAmount,
      initialAmount,
      contributed: f.contributed,
      withdrawn: f.withdrawn,
      targetDate,
      today,
    }),
  };
}

async function findGoal(db: DbClient, userId: string, id: string): Promise<GoalRow> {
  const goal = await db.goal.findUnique({
    where: { id_userId: { id, userId } },
    include: goalInclude,
  });
  if (!goal) throw notFound('Meta no encontrada.');
  return goal;
}

export async function listGoals(db: DbClient, auth: AuthContext): Promise<GoalDTO[]> {
  const goals = await db.goal.findMany({
    where: { userId: auth.userId, status: { not: 'ARCHIVED' } },
    include: goalInclude,
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });
  const flows = await flowsOf(db, auth.userId, goals);
  return goals.map((g) => toGoalDTO(g, flows.get(g.id)!, auth.today));
}

export async function getGoal(db: DbClient, auth: AuthContext, id: string): Promise<GoalDTO> {
  const goal = await findGoal(db, auth.userId, id);
  return toGoalDTO(goal, (await flowsOf(db, auth.userId, [goal])).get(id)!, auth.today);
}

/** Spec 7.3: el dinero de la meta vive en una cuenta de ahorro o inversión (activa y del usuario). */
async function checkGoalAccount(db: DbClient, userId: string, accountId: string) {
  const account = await db.account.findUnique({ where: { id_userId: { id: accountId, userId } } });
  if (
    !account ||
    !account.isActive ||
    (account.type !== 'SAVINGS' && account.type !== 'INVESTMENT')
  ) {
    throw badRequest('INVALID_REFERENCE', 'Revisa la cuenta de la meta.', {
      accountId: 'Elige una cuenta de ahorro o inversión',
    });
  }
}

export async function createGoal(
  db: DbClient,
  auth: AuthContext,
  input: GoalCreateInput,
): Promise<GoalDTO> {
  await checkGoalAccount(db, auth.userId, input.accountId);
  const goal = await db.goal.create({
    data: {
      userId: auth.userId,
      name: input.name,
      targetAmount: BigInt(input.targetAmount),
      targetDate: input.targetDate ? toDbDate(input.targetDate) : null,
      accountId: input.accountId,
      initialAmount: BigInt(input.initialAmount),
      icon: input.icon,
      color: input.color,
    },
  });
  return getGoal(db, auth, goal.id);
}

export async function updateGoal(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: GoalUpdateInput,
): Promise<GoalDTO> {
  const { userId } = auth;
  await db.$transaction(async (tx) => {
    const goal = await findGoal(tx, userId, id);
    if (input.accountId && input.accountId !== goal.accountId) {
      await checkGoalAccount(tx, userId, input.accountId);
      if ((await tx.transaction.count({ where: { userId, goalId: id } })) > 0) {
        throw conflict(
          'GOAL_HAS_MOVEMENTS',
          'Esta meta ya tiene abonos o retiros en su cuenta. Para usar otra cuenta, crea una meta nueva.',
        );
      }
    }
    await tx.goal.update({
      where: { id_userId: { id, userId } },
      data: {
        name: input.name,
        targetAmount: input.targetAmount !== undefined ? BigInt(input.targetAmount) : undefined,
        targetDate:
          input.targetDate === undefined
            ? undefined
            : input.targetDate
              ? toDbDate(input.targetDate)
              : null,
        accountId: input.accountId,
        initialAmount: input.initialAmount !== undefined ? BigInt(input.initialAmount) : undefined,
        icon: input.icon,
        color: input.color,
        status: input.status,
      },
    });
  });
  return getGoal(db, auth, id);
}

/** Addendum §3.5: sus abonos y retiros quedan como transferencias normales. */
export async function deleteGoal(db: PrismaClient, userId: string, id: string): Promise<void> {
  await findGoal(db, userId, id);
  await db.$transaction([
    db.transaction.updateMany({ where: { userId, goalId: id }, data: { goalId: null } }),
    db.goal.delete({ where: { id_userId: { id, userId } } }),
  ]);
}

export async function contributeToGoal(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: GoalContributionInput,
): Promise<TransactionResultDTO & { goal: GoalDTO }> {
  const goal = await findGoal(db, auth.userId, id);
  if (input.fromAccountId === goal.accountId) {
    throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
      fromAccountId: 'Elige una cuenta distinta a la de la meta',
    });
  }
  const result = await createTransaction(db, auth, {
    type: 'TRANSFER',
    amount: input.amount,
    date: input.date,
    accountId: input.fromAccountId,
    toAccountId: goal.accountId,
    goalId: goal.id,
    description: input.description ?? `Abono a ${goal.name}`,
    payee: null,
    notes: null,
    tags: [],
  });
  return { ...result, goal: await getGoal(db, auth, id) };
}

export async function withdrawFromGoal(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: GoalWithdrawalInput,
): Promise<TransactionResultDTO & { goal: GoalDTO }> {
  const goal = await findGoal(db, auth.userId, id);
  if (input.toAccountId === goal.accountId) {
    throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
      toAccountId: 'Elige una cuenta distinta a la de la meta',
    });
  }
  const { progress } = await getGoal(db, auth, id);
  if (input.amount > Math.max(0, progress)) {
    throw badRequest('WITHDRAWAL_EXCEEDS_GOAL', 'Revisa los datos ingresados.', {
      amount: 'No puedes retirar más de lo ahorrado en esta meta',
    });
  }
  const result = await createTransaction(db, auth, {
    type: 'TRANSFER',
    amount: input.amount,
    date: input.date,
    accountId: goal.accountId,
    toAccountId: input.toAccountId,
    goalId: goal.id,
    description: input.description ?? `Retiro de ${goal.name}`,
    payee: null,
    notes: null,
    tags: [],
  });
  return { ...result, goal: await getGoal(db, auth, id) };
}
