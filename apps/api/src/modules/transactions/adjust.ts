import {
  MAX_AMOUNT,
  SYSTEM_CATEGORY_KEYS,
  type AdjustBalanceInput,
  type AdjustBalanceResultDTO,
  type TransactionInput,
} from '@finanzas/shared';
import type { PrismaClient } from '../../generated/prisma/client';
import { badRequest, entityDeleted } from '../../lib/errors';
import type { AuthContext } from '../../types/fastify';
import { accountBalance, findAccount, getAccount } from '../accounts/service';
import { findSystemCategory } from '../categories/service';
import { getTransaction, insertTransaction, prepareTransaction } from './service';

/** Spec 8.13: el usuario indica el saldo real y se registra la diferencia como ingreso o gasto. */
export async function adjustBalance(
  db: PrismaClient,
  auth: AuthContext,
  accountId: string,
  input: AdjustBalanceInput,
): Promise<AdjustBalanceResultDTO> {
  const id = await db.$transaction(async (tx) => {
    // Review M3: la cuenta queda bloqueada hasta el final, así que de dos ajustes simultáneos al
    // mismo saldo el segundo ya ve el primero y responde NO_CHANGE.
    await tx.$queryRaw`
      SELECT id FROM "Account" WHERE id = ${accountId}::uuid AND "userId" = ${auth.userId}::uuid
      FOR UPDATE`;
    const account = await findAccount(tx, auth.userId, accountId);
    if (!account.isActive) throw entityDeleted(account.name, 'ajustar su saldo');
    const diff = input.actualBalance - (await accountBalance(tx, auth.userId, account));
    if (diff === 0) {
      throw badRequest('NO_CHANGE', 'Ese ya es el saldo de la cuenta.', {
        actualBalance: 'Es el saldo actual',
      });
    }
    if (Math.abs(diff) > MAX_AMOUNT) {
      throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
        actualBalance: 'La diferencia es demasiado grande',
      });
    }
    const category = await findSystemCategory(
      tx,
      auth.userId,
      diff > 0 ? SYSTEM_CATEGORY_KEYS.ADJUSTMENT_INCOME : SYSTEM_CATEGORY_KEYS.ADJUSTMENT_EXPENSE,
    );
    const base = {
      amount: Math.abs(diff),
      date: input.date ?? auth.today,
      accountId,
      categoryId: category.id,
      description: 'Ajuste de saldo',
      payee: null,
      notes: null,
      tags: [],
    };
    const txInput: TransactionInput =
      diff > 0 ? { type: 'INCOME', ...base } : { type: 'EXPENSE', ...base, paymentMethod: null };
    const prepared = await prepareTransaction(tx, auth, txInput, { allowSystemCategory: true });
    return insertTransaction(tx, auth.userId, prepared);
  });
  return {
    transaction: await getTransaction(db, auth.userId, id),
    account: await getAccount(db, auth.userId, accountId),
  };
}
