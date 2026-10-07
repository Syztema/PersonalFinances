import type { AccountCreateInput, AccountDTO, AccountUpdateInput } from '@finanzas/shared';
import { applyLedger } from '../../domain/ledger';
import type { Account } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { conflict, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { ledgerEntries } from '../ledger/repository';

const NAME_TAKEN = () => conflict('ACCOUNT_NAME_TAKEN', 'Ya tienes una cuenta con ese nombre.');

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
    if (isUniqueViolation(err)) throw NAME_TAKEN();
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

  if (input.isActive === false && account.isActive) {
    const initialChange =
      input.initialBalance !== undefined ? input.initialBalance - num(account.initialBalance) : 0;
    if ((await accountBalance(db, userId, account)) + initialChange !== 0) {
      throw conflict('ACCOUNT_HAS_BALANCE', 'Solo puedes archivar una cuenta con saldo $0.');
    }
  }
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
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
    return toAccountDTO(updated, await accountBalance(db, userId, updated));
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function deleteAccount(db: DbClient, userId: string, id: string): Promise<void> {
  await findAccount(db, userId, id);
  const [transactions, goals, rules, items] = await Promise.all([
    db.transaction.count({ where: { userId, OR: [{ accountId: id }, { toAccountId: id }] } }),
    db.goal.count({ where: { userId, accountId: id } }),
    db.recurringRule.count({ where: { userId, accountId: id } }),
    db.scheduledItem.count({ where: { userId, accountId: id } }),
  ]);
  if (transactions + goals + rules + items > 0) {
    throw conflict(
      'ACCOUNT_IN_USE',
      'Esta cuenta tiene movimientos. Archívala en lugar de eliminarla.',
    );
  }
  await db.account.delete({ where: { id_userId: { id, userId } } });
}
