import type { TransactionInput } from '@finanzas/shared';
import type { Account, Category, CreditCard, Debt, Goal } from '../../generated/prisma/client';
import { badRequest } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

export interface ResolvedRefs {
  account: Account | null;
  toAccount: Account | null;
  card: CreditCard | null;
  debt: Debt | null;
  category: Category | null;
  goal: Goal | null;
}

/** Referencias del movimiento original: si no cambian, se permiten aunque estén archivadas. */
export interface ExistingRefs {
  accountId: string | null;
  toAccountId: string | null;
  creditCardId: string | null;
  debtId: string | null;
  categoryId: string | null;
}

type RefKey = keyof ExistingRefs | 'goalId';

function refId(input: TransactionInput, key: RefKey): string | null {
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

export async function resolveRefs(
  db: DbClient,
  userId: string,
  input: TransactionInput,
  existing?: ExistingRefs,
): Promise<ResolvedRefs> {
  const ids = {
    accountId: refId(input, 'accountId'),
    toAccountId: refId(input, 'toAccountId'),
    creditCardId: refId(input, 'creditCardId'),
    debtId: refId(input, 'debtId'),
    categoryId: refId(input, 'categoryId'),
    goalId: refId(input, 'goalId'),
  };
  const key = (id: string) => ({ id_userId: { id, userId } });
  const [account, toAccount, card, debt, category, goal] = await Promise.all([
    ids.accountId ? db.account.findUnique({ where: key(ids.accountId) }) : null,
    ids.toAccountId ? db.account.findUnique({ where: key(ids.toAccountId) }) : null,
    ids.creditCardId ? db.creditCard.findUnique({ where: key(ids.creditCardId) }) : null,
    ids.debtId ? db.debt.findUnique({ where: key(ids.debtId) }) : null,
    ids.categoryId ? db.category.findUnique({ where: key(ids.categoryId) }) : null,
    ids.goalId ? db.goal.findUnique({ where: key(ids.goalId) }) : null,
  ]);

  const unchanged = (k: keyof ExistingRefs) => existing !== undefined && existing[k] === ids[k];
  const fields: Record<string, string> = {};

  const checkActive = (
    k: keyof ExistingRefs,
    entity: { isActive: boolean } | null,
    missing: string,
    archived: string,
  ) => {
    if (!ids[k]) return;
    if (!entity) fields[k] = missing;
    else if (!entity.isActive && !unchanged(k)) fields[k] = archived;
  };
  checkActive('accountId', account, 'Cuenta no encontrada', 'La cuenta está archivada');
  checkActive('toAccountId', toAccount, 'Cuenta no encontrada', 'La cuenta está archivada');
  checkActive('creditCardId', card, 'Tarjeta no encontrada', 'La tarjeta está archivada');
  checkActive('debtId', debt, 'Préstamo no encontrado', 'El préstamo está archivado');

  if (ids.categoryId) {
    const expected = input.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
    if (!category) fields.categoryId = 'Categoría no encontrada';
    else if (category.kind !== expected)
      fields.categoryId = 'La categoría no corresponde al tipo de movimiento';
    else if ((category.isSystem || !category.isActive) && !unchanged('categoryId'))
      fields.categoryId = 'Categoría no disponible';
  }

  if (ids.goalId) {
    if (!goal) fields.goalId = 'Meta no encontrada';
    else if (goal.accountId !== ids.accountId && goal.accountId !== ids.toAccountId) {
      fields.goalId = 'La transferencia debe entrar o salir de la cuenta de la meta';
    }
  }

  if (Object.keys(fields).length > 0) {
    throw badRequest(
      'INVALID_REFERENCE',
      'Revisa las cuentas, tarjetas o categorías seleccionadas.',
      fields,
    );
  }
  return { account, toAccount, card, debt, category, goal };
}
