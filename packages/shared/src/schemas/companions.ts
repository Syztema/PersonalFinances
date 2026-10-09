import { z } from 'zod';
import { zColor, zIcon, zName } from './common';

/** Spec con quién §2.1: nombre de 1 a 30 caracteres, ícono y color de la app. */
export const companionCreateSchema = z.strictObject({
  name: zName(30),
  icon: zIcon.default('user'),
  color: zColor.default('#64748b'),
});

export const companionUpdateSchema = z.strictObject({
  name: zName(30).optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
});

export type CompanionCreateInput = z.output<typeof companionCreateSchema>;
export type CompanionUpdateInput = z.output<typeof companionUpdateSchema>;
