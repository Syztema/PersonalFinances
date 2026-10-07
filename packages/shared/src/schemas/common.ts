import { z } from 'zod';
import { isValidIsoDate } from '../dates';
import { MAX_AMOUNT } from '../money';

z.config(z.locales.es());

export const zId = z.uuid('Identificador inválido');
export const zAmount = z
  .number('Debe ser un número')
  .int('Debe ser un valor entero')
  .min(1, 'Debe ser mayor que $0')
  .max(MAX_AMOUNT, 'Valor demasiado grande');
export const zNonNegativeAmount = z.number().int().min(0).max(MAX_AMOUNT);
export const zSignedAmount = z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT);
export const zIsoDate = z.string().refine(isValidIsoDate, 'Fecha inválida');
export const zColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido');
export const zIcon = z.string().trim().min(1).max(40);
export const zDayOfMonth = z.number().int().min(1).max(31);
export const zName = (max = 60) => z.string().trim().min(1, 'Requerido').max(max);

/** Crear: ausente, null o vacío → null. */
export const zOptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Editar: usar con `.optional()`; vacío → null (borra el valor). */
export const zNullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));
