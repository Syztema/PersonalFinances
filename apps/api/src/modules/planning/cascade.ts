import { startOfMonth, type IsoDate } from '@finanzas/shared';
import type { Prisma } from '../../generated/prisma/client';
import { toDbDate } from '../../lib/db';

export type DeletedRef =
  { accountId: string } | { creditCardId: string } | { categoryIds: string[] };

/**
 * Addendum §3.3: al eliminar lógicamente una cuenta, una tarjeta o categorías se pausan las reglas que
 * las usan y se borran las ocurrencias pendientes; para categorías, también sus líneas de presupuesto
 * del mes actual en adelante. El historial (movimientos, DONE/SKIPPED, meses pasados) no cambia.
 */
export async function cascadeSoftDelete(
  tx: Prisma.TransactionClient,
  userId: string,
  ref: DeletedRef,
  today: IsoDate,
) {
  const match =
    'accountId' in ref
      ? { accountId: ref.accountId }
      : 'creditCardId' in ref
        ? { creditCardId: ref.creditCardId }
        : { categoryId: { in: ref.categoryIds } };
  const rules = await tx.recurringRule.findMany({
    where: { userId, ...match },
    select: { id: true },
  });
  const ruleIds = rules.map((r) => r.id);
  if (ruleIds.length > 0) {
    await tx.recurringRule.updateMany({
      where: { userId, id: { in: ruleIds } },
      data: { isActive: false },
    });
  }
  await tx.scheduledItem.deleteMany({
    where: { userId, status: 'PENDING', OR: [{ recurringRuleId: { in: ruleIds } }, match] },
  });
  if ('categoryIds' in ref) {
    await tx.budgetCategory.deleteMany({
      where: {
        userId,
        categoryId: { in: ref.categoryIds },
        budget: { month: { gte: toDbDate(startOfMonth(today)) } },
      },
    });
  }
}
