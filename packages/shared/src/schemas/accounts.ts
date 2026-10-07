import { z } from 'zod';
import { ACCOUNT_TYPES } from '../enums';
import {
  zColor,
  zIcon,
  zIsoDate,
  zName,
  zNullableText,
  zOptionalText,
  zSignedAmount,
} from './common';

export const accountCreateSchema = z.strictObject({
  name: zName(60),
  type: z.enum(ACCOUNT_TYPES),
  institution: zOptionalText(60),
  initialBalance: zSignedAmount.default(0),
  openingDate: zIsoDate.optional(),
  icon: zIcon.default('wallet'),
  color: zColor.default('#64748b'),
});

export const accountUpdateSchema = z.strictObject({
  name: zName(60).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  institution: zNullableText(60).optional(),
  initialBalance: zSignedAmount.optional(),
  openingDate: zIsoDate.optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

/** Spec 8.13: el usuario indica el saldo real; se registra la diferencia. */
export const adjustBalanceSchema = z.strictObject({
  actualBalance: zSignedAmount,
  date: zIsoDate.optional(),
});

export type AccountCreateInput = z.output<typeof accountCreateSchema>;
export type AccountUpdateInput = z.output<typeof accountUpdateSchema>;
export type AdjustBalanceInput = z.output<typeof adjustBalanceSchema>;
