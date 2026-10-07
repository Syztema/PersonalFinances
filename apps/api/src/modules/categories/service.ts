import type {
  CategoryCreateInput,
  CategoryDTO,
  CategoryKind,
  CategoryUpdateInput,
  DeleteResultDTO,
} from '@finanzas/shared';
import type { Category, PrismaClient } from '../../generated/prisma/client';
import { badRequest, conflict, entityDeleted, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';
import type { AuthContext } from '../../types/fastify';
import { cascadeSoftDelete } from '../planning/cascade';

const NAME_TAKEN = () => conflict('CATEGORY_NAME_TAKEN', 'Ya tienes una categoría con ese nombre.');

export function toCategoryDTO(c: Category): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    parentId: c.parentId,
    bucket: c.bucket,
    icon: c.icon,
    color: c.color,
    isSystem: c.isSystem,
    systemKey: c.systemKey,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
  };
}

async function findCategory(db: DbClient, userId: string, id: string): Promise<Category> {
  const category = await db.category.findUnique({ where: { id_userId: { id, userId } } });
  if (!category) throw notFound('Categoría no encontrada.');
  return category;
}

/** Addendum §3.4: si la app necesita una categoría del sistema eliminada, la restaura. */
export async function findSystemCategory(
  db: DbClient,
  userId: string,
  systemKey: string,
): Promise<Category> {
  const category = await db.category.findUnique({
    where: { userId_systemKey: { userId, systemKey } },
  });
  if (!category) throw new Error(`Missing system category ${systemKey} for user`);
  if (category.isActive) return category;
  return db.category.update({
    where: { id_userId: { id: category.id, userId } },
    data: { isActive: true },
  });
}

async function validParent(
  db: DbClient,
  userId: string,
  parentId: string,
  kind: CategoryKind,
  selfId?: string,
) {
  const parent = await db.category.findUnique({ where: { id_userId: { id: parentId, userId } } });
  if (!parent)
    throw badRequest('INVALID_REFERENCE', 'Revisa la categoría padre.', {
      parentId: 'Categoría padre no encontrada',
    });
  if (parent.id === selfId)
    throw badRequest('INVALID_PARENT', 'Una categoría no puede ser su propia subcategoría.', {
      parentId: 'Inválida',
    });
  if (!parent.isActive)
    throw badRequest('INVALID_PARENT', 'La categoría principal fue eliminada.', {
      parentId: 'Categoría eliminada',
    });
  if (parent.parentId)
    throw badRequest('INVALID_PARENT', 'Solo se permite un nivel de subcategorías.', {
      parentId: 'Elige una categoría principal',
    });
  if (parent.kind !== kind)
    throw badRequest(
      'INVALID_PARENT',
      'La subcategoría debe ser del mismo tipo que su categoría principal.',
      { parentId: 'Tipo distinto' },
    );
  if (parent.isSystem)
    throw badRequest(
      'INVALID_PARENT',
      'No se pueden crear subcategorías de una categoría del sistema.',
      { parentId: 'No permitida' },
    );
  return parent;
}

async function assertRootNameFree(
  db: DbClient,
  userId: string,
  kind: CategoryKind,
  name: string,
  exceptId?: string,
) {
  const existing = await db.category.findFirst({
    where: {
      userId,
      kind,
      parentId: null,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { isActive: true },
  });
  if (!existing) return;
  if (!existing.isActive) {
    throw conflict(
      'CATEGORY_NAME_TAKEN',
      'Ya tienes una categoría eliminada con ese nombre. Restáurala desde Eliminados.',
    );
  }
  throw NAME_TAKEN();
}

/** Choque de nombre en una subcategoría: distingue si el hermano en conflicto está eliminado. */
async function siblingNameTaken(
  db: DbClient,
  userId: string,
  kind: CategoryKind,
  parentId: string | null,
  name: string,
  exceptId?: string,
) {
  const other = await db.category.findFirst({
    where: {
      userId,
      kind,
      parentId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { isActive: true },
  });
  return other && !other.isActive
    ? conflict(
        'CATEGORY_NAME_TAKEN',
        'Ya tienes una categoría eliminada con ese nombre. Restáurala desde Eliminados.',
      )
    : NAME_TAKEN();
}

export async function listCategories(db: DbClient, userId: string): Promise<CategoryDTO[]> {
  const items = await db.category.findMany({
    where: { userId },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return items.map(toCategoryDTO);
}

export async function createCategory(
  db: DbClient,
  userId: string,
  input: CategoryCreateInput,
): Promise<CategoryDTO> {
  let bucket = input.kind === 'EXPENSE' ? (input.bucket ?? 'OTHER') : null;
  if (input.parentId) {
    const parent = await validParent(db, userId, input.parentId, input.kind);
    if (input.kind === 'EXPENSE') bucket = input.bucket ?? parent.bucket ?? 'OTHER';
  } else {
    await assertRootNameFree(db, userId, input.kind, input.name);
  }
  const sortOrder = await db.category.count({ where: { userId } });
  try {
    const created = await db.category.create({
      data: {
        userId,
        name: input.name,
        kind: input.kind,
        parentId: input.parentId,
        bucket,
        icon: input.icon,
        color: input.color,
        sortOrder,
      },
    });
    return toCategoryDTO(created);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw await siblingNameTaken(db, userId, input.kind, input.parentId ?? null, input.name);
    }
    throw err;
  }
}

export async function updateCategory(
  db: DbClient,
  userId: string,
  id: string,
  input: CategoryUpdateInput,
): Promise<CategoryDTO> {
  const current = await findCategory(db, userId, id);
  if (!current.isActive) throw entityDeleted(current.name, 'editarla');
  if (input.bucket && current.kind === 'INCOME') {
    throw badRequest('INVALID_BUCKET', 'Las categorías de ingreso no tienen bolsa.', {
      bucket: 'No aplica',
    });
  }
  if (input.parentId && current.systemKey) {
    throw badRequest('INVALID_PARENT', 'Las categorías del sistema no pueden ser subcategorías.', {
      parentId: 'No permitida',
    });
  }
  if (input.parentId) {
    await validParent(db, userId, input.parentId, current.kind, id);
    if ((await db.category.count({ where: { userId, parentId: id } })) > 0) {
      throw badRequest(
        'INVALID_PARENT',
        'Una categoría con subcategorías no puede volverse subcategoría.',
        { parentId: 'No permitida' },
      );
    }
  }
  const finalParent = input.parentId !== undefined ? input.parentId : current.parentId;
  if (!finalParent && (input.name || input.parentId === null)) {
    await assertRootNameFree(db, userId, current.kind, input.name ?? current.name, id);
  }
  try {
    const updated = await db.category.update({
      where: { id_userId: { id, userId } },
      data: {
        name: input.name,
        parentId: input.parentId,
        bucket: input.bucket,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
      },
    });
    return toCategoryDTO(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw await siblingNameTaken(
        db,
        userId,
        current.kind,
        finalParent ?? null,
        input.name ?? current.name,
        id,
      );
    }
    throw err;
  }
}

/**
 * Addendum §3: una categoría principal se elimina con sus subcategorías. Sin referencias se borran;
 * con historial (o si es del sistema) se eliminan lógicamente y se aplican los efectos en cadena.
 */
export async function deleteCategory(
  db: PrismaClient,
  auth: AuthContext,
  id: string,
): Promise<DeleteResultDTO> {
  const { userId } = auth;
  const category = await findCategory(db, userId, id);
  if (!category.isActive) return { deleted: 'soft' };
  const children = await db.category.findMany({
    where: { userId, parentId: id },
    select: { id: true, systemKey: true },
  });
  const ids = [id, ...children.map((c) => c.id)];
  const counts = await Promise.all([
    db.transaction.count({ where: { userId, categoryId: { in: ids } } }),
    db.budgetCategory.count({ where: { userId, categoryId: { in: ids } } }),
    db.recurringRule.count({ where: { userId, categoryId: { in: ids } } }),
    db.scheduledItem.count({ where: { userId, categoryId: { in: ids } } }),
  ]);
  if (!category.systemKey && children.every((c) => !c.systemKey) && counts.every((c) => c === 0)) {
    await db.$transaction([
      db.category.deleteMany({ where: { userId, parentId: id } }),
      db.category.delete({ where: { id_userId: { id, userId } } }),
    ]);
    return { deleted: 'hard' };
  }
  await db.$transaction(async (tx) => {
    await tx.category.updateMany({ where: { userId, id: { in: ids } }, data: { isActive: false } });
    await cascadeSoftDelete(tx, userId, { categoryIds: ids }, auth.today);
  });
  return { deleted: 'soft' };
}

/** Restaurar una principal restaura sus subcategorías; una subcategoría exige su principal activa. */
export async function restoreCategory(
  db: DbClient,
  userId: string,
  id: string,
): Promise<CategoryDTO> {
  const category = await findCategory(db, userId, id);
  if (category.parentId) {
    const parent = await findCategory(db, userId, category.parentId);
    if (!parent.isActive) {
      throw conflict('PARENT_DELETED', `Restaura primero "${parent.name}".`);
    }
  }
  await db.category.updateMany({
    where: { userId, OR: [{ id }, { parentId: id }] },
    data: { isActive: true },
  });
  return toCategoryDTO(await findCategory(db, userId, id));
}
