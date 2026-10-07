import type { ScheduledKind } from '@finanzas/shared';
import { badRequest } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

/** Reglas y ocurrencias: categoría del tipo correcto, activa y no del sistema; cuenta o tarjeta activas. */
export async function checkScheduleRefs(
  db: DbClient,
  userId: string,
  v: {
    kind: ScheduledKind;
    categoryId: string;
    accountId: string | null;
    creditCardId: string | null;
  },
) {
  const key = (id: string) => ({ id_userId: { id, userId } });
  const [category, account, card] = await Promise.all([
    db.category.findUnique({ where: key(v.categoryId) }),
    v.accountId ? db.account.findUnique({ where: key(v.accountId) }) : null,
    v.creditCardId ? db.creditCard.findUnique({ where: key(v.creditCardId) }) : null,
  ]);
  const fields: Record<string, string> = {};
  if (!category) fields.categoryId = 'Categoría no encontrada';
  else if (category.kind !== v.kind) fields.categoryId = 'La categoría no corresponde al tipo';
  else if (!category.isActive || category.isSystem) fields.categoryId = 'Categoría no disponible';
  if (v.accountId && !account) fields.accountId = 'Cuenta no encontrada';
  else if (account && !account.isActive) fields.accountId = 'La cuenta fue eliminada';
  if (v.creditCardId && !card) fields.creditCardId = 'Tarjeta no encontrada';
  else if (card && !card.isActive) fields.creditCardId = 'La tarjeta fue eliminada';
  if (Object.keys(fields).length > 0) {
    throw badRequest('INVALID_REFERENCE', 'Revisa la categoría, la cuenta o la tarjeta.', fields);
  }
}
