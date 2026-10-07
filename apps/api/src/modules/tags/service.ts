import type { TagDTO } from '@finanzas/shared';
import { conflict, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

export async function listTags(db: DbClient, userId: string): Promise<TagDTO[]> {
  const tags = await db.tag.findMany({
    where: { userId },
    include: { _count: { select: { transactions: true } } },
    orderBy: { name: 'asc' },
  });
  return tags.map((t) => ({ id: t.id, name: t.name, usageCount: t._count.transactions }));
}

export async function deleteTag(db: DbClient, userId: string, id: string): Promise<void> {
  const result = await db.tag.deleteMany({ where: { id, userId } });
  if (result.count === 0) throw notFound('Etiqueta no encontrada.');
}

export async function renameTag(
  db: DbClient,
  userId: string,
  id: string,
  name: string,
): Promise<TagDTO> {
  try {
    const { count } = await db.tag.updateMany({ where: { id, userId }, data: { name } });
    if (count === 0) throw notFound('Etiqueta no encontrada.');
  } catch (err) {
    if (isUniqueViolation(err))
      throw conflict('TAG_NAME_TAKEN', 'Ya tienes una etiqueta con ese nombre.');
    throw err;
  }
  const tag = await db.tag.findUniqueOrThrow({
    where: { id_userId: { id, userId } },
    include: { _count: { select: { transactions: true } } },
  });
  return { id: tag.id, name: tag.name, usageCount: tag._count.transactions };
}
