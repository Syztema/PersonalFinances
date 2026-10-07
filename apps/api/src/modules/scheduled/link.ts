import type { RecurringOnCreateInput, TransactionInput } from '@finanzas/shared';
import { isOccurrence } from '../../domain/recurrence';
import type { Prisma } from '../../generated/prisma/client';
import { toDbDate } from '../../lib/db';
import { badRequest, conflict } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

export interface LinkPlan {
  scheduledItemId: string | null;
  recurring: RecurringOnCreateInput | null;
}

const NOT_PENDING = () => conflict('NOT_PENDING', 'Esta ocurrencia ya fue pagada u omitida.');

/** Spec 8.11: valida el enlace con una ocurrencia o la regla recurrente antes de escribir. */
export async function prepareLink(
  db: DbClient,
  userId: string,
  input: TransactionInput,
  link: LinkPlan,
): Promise<LinkPlan> {
  if (link.scheduledItemId && link.recurring) {
    throw badRequest(
      'VALIDATION_ERROR',
      'Elige enlazar con una obligación o marcar como recurrente.',
      {
        recurring: 'No se puede junto con un enlace',
      },
    );
  }
  if (link.scheduledItemId) {
    const item = await db.scheduledItem.findFirst({ where: { id: link.scheduledItemId, userId } });
    if (!item) {
      throw badRequest('INVALID_REFERENCE', 'Revisa la obligación seleccionada.', {
        scheduledItemId: 'Ocurrencia no encontrada',
      });
    }
    if (item.status !== 'PENDING') throw NOT_PENDING();
    if (item.kind !== (input.type === 'INCOME' ? 'INCOME' : 'EXPENSE')) {
      throw badRequest('INVALID_REFERENCE', 'Revisa la obligación seleccionada.', {
        scheduledItemId: 'No corresponde al tipo de movimiento',
      });
    }
  }
  if (link.recurring) {
    const r = link.recurring;
    if (r.endDate && r.endDate < input.date) {
      throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
        'recurring.endDate': 'Debe ser igual o posterior a la fecha del movimiento',
      });
    }
    // Plan, decisión 4: en la quincena, la fecha del movimiento es uno de sus dos días.
    if (
      r.frequency === 'SEMIMONTHLY' &&
      !isOccurrence({ ...r, startDate: input.date, endDate: null }, input.date)
    ) {
      throw badRequest('VALIDATION_ERROR', 'Revisa los datos ingresados.', {
        'recurring.day1': 'La fecha del movimiento debe ser uno de los dos días de la quincena',
      });
    }
  }
  return link;
}

/** Escribe el enlace en la misma transacción de base de datos que el movimiento. */
export async function applyLink(
  tx: Prisma.TransactionClient,
  userId: string,
  transactionId: string,
  input: TransactionInput,
  link: LinkPlan,
  name: string,
) {
  if (link.scheduledItemId) {
    const { count } = await tx.scheduledItem.updateMany({
      where: { id: link.scheduledItemId, userId, status: 'PENDING' },
      data: { status: 'DONE', transactionId },
    });
    if (count !== 1) throw NOT_PENDING();
  }
  if (
    link.recurring &&
    (input.type === 'INCOME' || input.type === 'EXPENSE' || input.type === 'CARD_PURCHASE')
  ) {
    const r = link.recurring;
    const date = toDbDate(input.date);
    const common = {
      userId,
      kind: input.type === 'INCOME' ? ('INCOME' as const) : ('EXPENSE' as const),
      name,
      amount: BigInt(input.amount),
      categoryId: input.categoryId,
      accountId: input.type === 'CARD_PURCHASE' ? null : input.accountId,
      creditCardId: input.type === 'CARD_PURCHASE' ? input.creditCardId : null,
    };
    const rule = await tx.recurringRule.create({
      data: {
        ...common,
        frequency: r.frequency,
        intervalDays: r.intervalDays,
        day1: r.day1,
        day2: r.day2,
        startDate: date,
        endDate: r.endDate ? toDbDate(r.endDate) : null,
        activeFrom: date,
      },
    });
    await tx.scheduledItem.create({
      data: {
        ...common,
        recurringRuleId: rule.id,
        ruleDate: date,
        dueDate: date,
        status: 'DONE',
        transactionId,
      },
    });
  }
}
