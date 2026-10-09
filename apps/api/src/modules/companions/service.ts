import type {
  CompanionCreateInput,
  CompanionDTO,
  CompanionUpdateInput,
  DeleteResultDTO,
} from '@finanzas/shared';
import type { Companion } from '../../generated/prisma/client';
import { conflict, entityDeleted, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

const withUsage = { _count: { select: { transactions: true } } } as const;
type CompanionRow = Companion & { _count: { transactions: number } };

const NAME_TAKEN = () => conflict('COMPANION_NAME_TAKEN', 'Ya tienes una opción con ese nombre.');

function toCompanionDTO(c: CompanionRow): CompanionDTO {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    usageCount: c._count.transactions,
  };
}

async function findCompanion(db: DbClient, userId: string, id: string): Promise<CompanionRow> {
  const companion = await db.companion.findUnique({
    where: { id_userId: { id, userId } },
    include: withUsage,
  });
  if (!companion) throw notFound('Opción no encontrada.');
  return companion;
}

/** Spec con quién §2.3: el nombre es único por usuario sin distinguir mayúsculas, también frente a las eliminadas. */
async function nameTaken(db: DbClient, userId: string, name: string, exceptId?: string) {
  const other = await db.companion.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { isActive: true },
  });
  if (!other) return null;
  return other.isActive
    ? NAME_TAKEN()
    : conflict(
        'COMPANION_NAME_TAKEN',
        'Ya existe una opción eliminada con ese nombre; restáurala.',
      );
}

export async function listCompanions(db: DbClient, userId: string): Promise<CompanionDTO[]> {
  const rows = await db.companion.findMany({
    where: { userId },
    include: withUsage,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toCompanionDTO);
}

export async function createCompanion(
  db: DbClient,
  userId: string,
  input: CompanionCreateInput,
): Promise<CompanionDTO> {
  const taken = await nameTaken(db, userId, input.name);
  if (taken) throw taken;
  const { _max } = await db.companion.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  try {
    const created = await db.companion.create({
      data: {
        userId,
        name: input.name,
        icon: input.icon,
        color: input.color,
        sortOrder: (_max.sortOrder ?? -1) + 1,
      },
      include: withUsage,
    });
    return toCompanionDTO(created);
  } catch (err) {
    if (isUniqueViolation(err)) throw (await nameTaken(db, userId, input.name)) ?? NAME_TAKEN();
    throw err;
  }
}

export async function updateCompanion(
  db: DbClient,
  userId: string,
  id: string,
  input: CompanionUpdateInput,
): Promise<CompanionDTO> {
  const current = await findCompanion(db, userId, id);
  if (!current.isActive) throw entityDeleted(current.name, 'editarla');
  if (input.name !== undefined) {
    const taken = await nameTaken(db, userId, input.name, id);
    if (taken) throw taken;
  }
  try {
    const updated = await db.companion.update({
      where: { id_userId: { id, userId } },
      data: { name: input.name, icon: input.icon, color: input.color },
      include: withUsage,
    });
    return toCompanionDTO(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw (await nameTaken(db, userId, input.name ?? current.name, id)) ?? NAME_TAKEN();
    }
    throw err;
  }
}

/** Spec con quién §2.3: sin movimientos se borra; con movimientos queda eliminada y conserva el historial. */
export async function deleteCompanion(
  db: DbClient,
  userId: string,
  id: string,
): Promise<DeleteResultDTO> {
  const companion = await findCompanion(db, userId, id);
  if (!companion.isActive) return { deleted: 'soft' };
  if (companion._count.transactions === 0) {
    await db.companion.delete({ where: { id_userId: { id, userId } } });
    return { deleted: 'hard' };
  }
  await db.companion.update({ where: { id_userId: { id, userId } }, data: { isActive: false } });
  return { deleted: 'soft' };
}

export async function restoreCompanion(
  db: DbClient,
  userId: string,
  id: string,
): Promise<CompanionDTO> {
  await findCompanion(db, userId, id);
  const restored = await db.companion.update({
    where: { id_userId: { id, userId } },
    data: { isActive: true },
    include: withUsage,
  });
  return toCompanionDTO(restored);
}
