import type {
  CategoryCreateInput,
  CategoryDTO,
  CategoryKind,
  CategoryUpdateInput,
} from '@finanzas/shared';
import type { Category } from '../../generated/prisma/client';
import { badRequest, conflict, isUniqueViolation, notFound } from '../../lib/errors';
import type { DbClient } from '../../lib/prisma';

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

export async function findSystemCategory(
  db: DbClient,
  userId: string,
  systemKey: string,
): Promise<Category> {
  const category = await db.category.findUnique({
    where: { userId_systemKey: { userId, systemKey } },
  });
  if (!category) throw new Error(`Missing system category ${systemKey} for user`);
  return category;
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
    select: { id: true },
  });
  if (existing) throw NAME_TAKEN();
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
    if (isUniqueViolation(err)) throw NAME_TAKEN();
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
  if (current.isSystem)
    throw conflict('SYSTEM_CATEGORY', 'Esta categoría es del sistema y no se puede modificar.');
  if (input.bucket && current.kind === 'INCOME') {
    throw badRequest('INVALID_BUCKET', 'Las categorías de ingreso no tienen bolsa.', {
      bucket: 'No aplica',
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
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
    return toCategoryDTO(updated);
  } catch (err) {
    if (isUniqueViolation(err)) throw NAME_TAKEN();
    throw err;
  }
}

export async function deleteCategory(db: DbClient, userId: string, id: string): Promise<void> {
  const category = await findCategory(db, userId, id);
  if (category.isSystem || category.systemKey) {
    throw conflict('SYSTEM_CATEGORY', 'Esta categoría no se puede eliminar.');
  }
  const counts = await Promise.all([
    db.transaction.count({ where: { userId, categoryId: id } }),
    db.category.count({ where: { userId, parentId: id } }),
    db.budgetCategory.count({ where: { userId, categoryId: id } }),
    db.recurringRule.count({ where: { userId, categoryId: id } }),
    db.scheduledItem.count({ where: { userId, categoryId: id } }),
  ]);
  if (counts.some((c) => c > 0)) {
    throw conflict(
      'CATEGORY_IN_USE',
      'Esta categoría tiene movimientos o subcategorías. Archívala en lugar de eliminarla.',
    );
  }
  await db.category.delete({ where: { id_userId: { id, userId } } });
}
