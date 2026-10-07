import { z } from 'zod';
import { BUCKETS, CATEGORY_KINDS } from '../enums';
import { zColor, zIcon, zId, zName } from './common';

export const categoryCreateSchema = z.strictObject({
  name: zName(40),
  kind: z.enum(CATEGORY_KINDS),
  parentId: zId.nullish().transform((v) => v ?? null),
  bucket: z
    .enum(BUCKETS)
    .nullish()
    .transform((v) => v ?? null),
  icon: zIcon.default('tag'),
  color: zColor.default('#64748b'),
});

export const categoryUpdateSchema = z.strictObject({
  name: zName(40).optional(),
  parentId: zId.nullable().optional(),
  bucket: z.enum(BUCKETS).optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export type CategoryCreateInput = z.output<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.output<typeof categoryUpdateSchema>;
