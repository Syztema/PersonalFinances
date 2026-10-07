import type { TagDTO } from '@finanzas/shared';
import { notFound } from '../../lib/errors';
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
