import { z } from 'zod';
import {
  zAmount,
  zColor,
  zDayOfMonth,
  zIcon,
  zIsoDate,
  zName,
  zNonNegativeAmount,
  zNullableText,
  zOptionalText,
} from './common';

const zInstallments = z.number().int().min(1).max(48);

export const creditCardCreateSchema = z.strictObject({
  name: zName(60),
  issuer: zOptionalText(60),
  creditLimit: zAmount,
  initialDebt: zNonNegativeAmount.default(0),
  initialDebtInstallments: zInstallments.default(1),
  openingDate: zIsoDate.optional(),
  statementDay: zDayOfMonth,
  paymentDueDay: zDayOfMonth,
  icon: zIcon.default('credit-card'),
  color: zColor.default('#7c3aed'),
});

export const creditCardUpdateSchema = z.strictObject({
  name: zName(60).optional(),
  issuer: zNullableText(60).optional(),
  creditLimit: zAmount.optional(),
  initialDebt: zNonNegativeAmount.optional(),
  initialDebtInstallments: zInstallments.optional(),
  openingDate: zIsoDate.optional(),
  statementDay: zDayOfMonth.optional(),
  paymentDueDay: zDayOfMonth.optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export type CreditCardCreateInput = z.output<typeof creditCardCreateSchema>;
export type CreditCardUpdateInput = z.output<typeof creditCardUpdateSchema>;
