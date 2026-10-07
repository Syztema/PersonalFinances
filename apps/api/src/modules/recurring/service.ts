import {
  addDays,
  addMonths,
  endOfMonth,
  type IsoDate,
  type RecurringRuleCreateInput,
  type RecurringRuleDTO,
  type RecurringRuleUpdateInput,
} from '@finanzas/shared';
import { nextOccurrence, occurrences, type RecurrenceTerms } from '../../domain/recurrence';
import type { Prisma, PrismaClient, RecurringRule } from '../../generated/prisma/client';
import { fromDbDate, num, toDbDate } from '../../lib/db';
import { notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import { accountRefSelect, categoryRefSelect, refSelect } from '../../lib/selects';
import type { AuthContext } from '../../types/fastify';
import { checkScheduleRefs } from '../planning/refs';

const ruleInclude = {
  category: { select: categoryRefSelect },
  account: { select: accountRefSelect },
  creditCard: { select: refSelect },
} satisfies Prisma.RecurringRuleInclude;
type RuleRow = Prisma.RecurringRuleGetPayload<{ include: typeof ruleInclude }>;

export function termsOf(r: RecurringRule): RecurrenceTerms {
  return {
    frequency: r.frequency,
    intervalDays: r.intervalDays,
    day1: r.day1,
    day2: r.day2,
    startDate: fromDbDate(r.startDate),
    endDate: r.endDate ? fromDbDate(r.endDate) : null,
  };
}

function toRuleDTO(r: RuleRow, today: IsoDate): RecurringRuleDTO {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    amount: num(r.amount),
    category: r.category,
    account: r.account,
    creditCard: r.creditCard,
    frequency: r.frequency,
    intervalDays: r.intervalDays,
    day1: r.day1,
    day2: r.day2,
    startDate: fromDbDate(r.startDate),
    endDate: r.endDate ? fromDbDate(r.endDate) : null,
    isActive: r.isActive,
    nextDate: r.isActive ? nextOccurrence(termsOf(r), today) : null,
  };
}

/** Plan, decisión 3: genera desde max(startDate, activeFrom, hoy − 31) hasta el fin del mes siguiente. */
function itemsFor(rule: RecurringRule, today: IsoDate) {
  const activeFrom = fromDbDate(rule.activeFrom);
  const floor = addDays(today, -31);
  const from = activeFrom > floor ? activeFrom : floor;
  return occurrences(termsOf(rule), from, endOfMonth(addMonths(today, 1))).map((d) => ({
    userId: rule.userId,
    recurringRuleId: rule.id,
    kind: rule.kind,
    name: rule.name,
    amount: rule.amount,
    categoryId: rule.categoryId,
    accountId: rule.accountId,
    creditCardId: rule.creditCardId,
    ruleDate: toDbDate(d),
    dueDate: toDbDate(d),
  }));
}

/** Spec 8.11: generación perezosa e idempotente (ON CONFLICT DO NOTHING sobre regla + ruleDate). */
export async function ensureScheduled(
  db: DbClient,
  userId: string,
  today: IsoDate,
  ruleIds?: string[],
) {
  const rules = await db.recurringRule.findMany({
    where: { userId, isActive: true, ...(ruleIds && { id: { in: ruleIds } }) },
  });
  const data = rules.flatMap((r) => itemsFor(r, today));
  if (data.length > 0) await db.scheduledItem.createMany({ data, skipDuplicates: true });
}

async function findRule(db: DbClient, userId: string, id: string) {
  const rule = await db.recurringRule.findUnique({ where: { id_userId: { id, userId } } });
  if (!rule) throw notFound('Regla no encontrada.');
  return rule;
}

function ruleData(input: RecurringRuleCreateInput) {
  return {
    name: input.name,
    kind: input.kind,
    amount: BigInt(input.amount),
    categoryId: input.categoryId,
    accountId: input.accountId,
    creditCardId: input.creditCardId,
    frequency: input.frequency,
    intervalDays: input.intervalDays,
    day1: input.day1,
    day2: input.day2,
    startDate: toDbDate(input.startDate),
    endDate: input.endDate ? toDbDate(input.endDate) : null,
  };
}

export async function listRules(db: DbClient, auth: AuthContext): Promise<RecurringRuleDTO[]> {
  const rules = await db.recurringRule.findMany({
    where: { userId: auth.userId },
    include: ruleInclude,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  return rules.map((r) => toRuleDTO(r, auth.today));
}

export async function getRule(
  db: DbClient,
  auth: AuthContext,
  id: string,
): Promise<RecurringRuleDTO> {
  const rule = await db.recurringRule.findUnique({
    where: { id_userId: { id, userId: auth.userId } },
    include: ruleInclude,
  });
  if (!rule) throw notFound('Regla no encontrada.');
  return toRuleDTO(rule, auth.today);
}

export async function createRule(
  db: PrismaClient,
  auth: AuthContext,
  input: RecurringRuleCreateInput,
): Promise<RecurringRuleDTO> {
  await checkScheduleRefs(db, auth.userId, input);
  const rule = await db.recurringRule.create({
    data: { userId: auth.userId, ...ruleData(input), activeFrom: toDbDate(auth.today) },
  });
  await ensureScheduled(db, auth.userId, auth.today, [rule.id]);
  return getRule(db, auth, rule.id);
}

export async function updateRule(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
  input: RecurringRuleUpdateInput,
): Promise<RecurringRuleDTO> {
  const { userId, today } = auth;
  const stored = await findRule(db, userId, id);
  const refsChanged =
    input.kind !== stored.kind ||
    input.categoryId !== stored.categoryId ||
    input.accountId !== stored.accountId ||
    input.creditCardId !== stored.creditCardId;
  if (input.isActive || refsChanged) await checkScheduleRefs(db, userId, input);
  await db.$transaction(async (tx) => {
    await tx.recurringRule.update({
      where: { id_userId: { id, userId } },
      data: { ...ruleData(input), isActive: input.isActive, activeFrom: toDbDate(today) },
    });
    await tx.scheduledItem.deleteMany({
      where: { userId, recurringRuleId: id, status: 'PENDING', ruleDate: { gte: toDbDate(today) } },
    });
  });
  if (input.isActive) await ensureScheduled(db, userId, today, [id]);
  return getRule(db, auth, id);
}

export async function deleteRule(db: PrismaClient, userId: string, id: string): Promise<void> {
  await findRule(db, userId, id);
  await db.$transaction([
    db.scheduledItem.deleteMany({ where: { userId, recurringRuleId: id, status: 'PENDING' } }),
    db.scheduledItem.updateMany({
      where: { userId, recurringRuleId: id },
      data: { recurringRuleId: null, ruleDate: null },
    }),
    db.recurringRule.delete({ where: { id_userId: { id, userId } } }),
  ]);
}
