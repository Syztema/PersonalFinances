import {
  formatCOP,
  type AccountCreateInput,
  type AccountDTO,
  type AccountUpdateInput,
  type DeleteResultDTO,
} from '@finanzas/shared';
import { applyLedger } from '../../domain/ledger';
import type { Account, PrismaClient } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { conflict, entityDeleted, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { ledgerEntries } from '../ledger/repository';
import { cascadeSoftDelete } from '../planning/cascade';

const NAME_TAKEN = () => conflict('ACCOUNT_NAME_TAKEN', 'Ya tienes una cuenta con ese nombre.');

/** Un nombre ocupado por una cuenta eliminada se recupera restaurándola (addendum §3.1). */
async function nameTaken(db: DbClient, userId: string, name: string) {
  const other = await db.account.findUnique({
    where: { userId_name: { userId, name } },
    select: { isActive: true },
  });
  return other && !other.isActive
    ? conflict(
        'ACCOUNT_NAME_TAKEN',
        'Ya tienes una cuenta eliminada con ese nombre. Restáurala desde Eliminados.',
      )
    : NAME_TAKEN();
}

export function toAccountDTO(a: Account, balance: number): AccountDTO {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution,
    initialBalance: num(a.initialBalance),
    openingDate: fromDbDate(a.openingDate),
    icon: a.icon,
    color: a.color,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    balance,
  };
}

export async function findAccount(db: DbClient, userId: string, id: string): Promise<Account> {
  const account = await db.account.findUnique({ where: { id_userId: { id, userId } } });
  if (!account) throw notFound('Cuenta no encontrada.');
  return account;
}

export async function accountBalance(
  db: DbClient,
  userId: string,
  account: Account,
  excludeIds: string[] = [],
) {
  const totals = applyLedger(
    await ledgerEntries(db, userId, { accountId: account.id, excludeIds }),
  );
  return num(account.initialBalance) + (totals.accountDeltas.get(account.id) ?? 0);
}

export async function listAccounts(db: DbClient, userId: string): Promise<AccountDTO[]> {
  const [accounts, entries] = await Promise.all([
    db.account.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    ledgerEntries(db, userId),
  ]);
  const { accountDeltas } = applyLedger(entries);
  return accounts.map((a) =>
    toAccountDTO(a, num(a.initialBalance) + (accountDeltas.get(a.id) ?? 0)),
  );
}

export async function getAccount(db: DbClient, userId: string, id: string): Promise<AccountDTO> {
  const account = await findAccount(db, userId, id);
  return toAccountDTO(account, await accountBalance(db, userId, account));
}

export async function createAccount(
  db: DbClient,
  auth: AuthContext,
  input: AccountCreateInput,
): Promise<AccountDTO> {
  const sortOrder = await db.account.count({ where: { userId: auth.userId } });
  try {
    const account = await db.account.create({
      data: {
        userId: auth.userId,
        name: input.name,
        type: input.type,
        institution: input.institution,
        initialBalance: BigInt(input.initialBalance),
        openingDate: toDbDate(input.openingDate ?? auth.today),
        icon: input.icon,
        color: input.color,
        sortOrder,
      },
    });
    return toAccountDTO(account, num(account.initialBalance));
  } catch (err) {
    if (isUniqueViolation(err)) throw await nameTaken(db, auth.userId, input.name);
    throw err;
  }
}

export async function updateAccount(
  db: DbClient,
  userId: string,
  id: string,
  input: AccountUpdateInput,
): Promise<AccountDTO> {
  const account = await findAccount(db, userId, id);
  if (!account.isActive) throw entityDeleted(account.name, 'editarla');
  if (input.type && input.type !== 'SAVINGS' && input.type !== 'INVESTMENT') {
    if ((await db.goal.count({ where: { userId, accountId: id } })) > 0) {
      throw conflict(
        'ACCOUNT_HAS_GOALS',
        'Esta cuenta guarda metas: debe seguir siendo de ahorro o inversión.',
      );
    }
  }
  try {
    const updated = await db.account.update({
      where: { id_userId: { id, userId } },
      data: {
        name: input.name,
        type: input.type,
        institution: input.institution,
        initialBalance:
          input.initialBalance !== undefined ? BigInt(input.initialBalance) : undefined,
        openingDate: input.openingDate ? toDbDate(input.openingDate) : undefined,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
      },
    });
    return toAccountDTO(updated, await accountBalance(db, userId, updated));
  } catch (err) {
    if (isUniqueViolation(err)) throw await nameTaken(db, userId, input.name ?? account.name);
    throw err;
  }
}

/** Addendum §3: sin referencias se borra; con historial se elimina lógicamente. Exige saldo $0. */
export async function deleteAccount(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
): Promise<DeleteResultDTO> {
  const { userId } = auth;
  const account = await findAccount(db, userId, id);
  if (!account.isActive) return { deleted: 'soft' };
  const balance = await accountBalance(db, userId, account);
  if (balance !== 0) {
    throw conflict(
      'ACCOUNT_HAS_BALANCE',
      `La cuenta tiene un saldo de ${formatCOP(balance)}. Déjala en $0 antes de eliminarla: transfiere el dinero, ajusta el saldo o corrige el saldo inicial.`,
    );
  }
  if ((await db.goal.count({ where: { userId, accountId: id } })) > 0) {
    throw conflict(
      'ACCOUNT_HAS_GOALS',
      'Esta cuenta guarda metas. Elimínalas o muévelas a otra cuenta antes de eliminarla.',
    );
  }
  const [transactions, rules, items] = await Promise.all([
    db.transaction.count({ where: { userId, OR: [{ accountId: id }, { toAccountId: id }] } }),
    db.recurringRule.count({ where: { userId, accountId: id } }),
    db.scheduledItem.count({ where: { userId, accountId: id } }),
  ]);
  if (transactions + rules + items === 0) {
    await db.account.delete({ where: { id_userId: { id, userId } } });
    return { deleted: 'hard' };
  }
  await db.$transaction(async (tx) => {
    await tx.account.update({ where: { id_userId: { id, userId } }, data: { isActive: false } });
    await cascadeSoftDelete(tx, userId, { accountId: id }, auth.today);
  });
  return { deleted: 'soft' };
}

export async function restoreAccount(
  db: DbClient,
  userId: string,
  id: string,
): Promise<AccountDTO> {
  await findAccount(db, userId, id);
  const account = await db.account.update({
    where: { id_userId: { id, userId } },
    data: { isActive: true },
  });
  return toAccountDTO(account, await accountBalance(db, userId, account));
}
