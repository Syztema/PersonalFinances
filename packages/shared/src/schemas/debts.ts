import { z } from 'zod';
import {
  zAmount,
  zColor,
  zDayOfMonth,
  zIcon,
  zId,
  zIsoDate,
  zName,
  zNonNegativeAmount,
  zNullableText,
  zOptionalText,
} from './common';

export const debtCreateSchema = z
  .strictObject({
    name: zName(60),
    lender: zOptionalText(60),
    initialBalance: zNonNegativeAmount,
    openingDate: zIsoDate.optional(),
    monthlyPayment: zAmount.nullish().transform((v) => v ?? null),
    paymentDay: zDayOfMonth.nullish().transform((v) => v ?? null),
    receivedInAccountId: zId.nullish().transform((v) => v ?? null),
    icon: zIcon.default('landmark'),
    color: zColor.default('#0f766e'),
  })
  .refine((v) => !v.receivedInAccountId || v.initialBalance > 0, {
    path: ['initialBalance'],
    message: 'Indica el valor recibido',
  });

export const debtUpdateSchema = z.strictObject({
  name: zName(60).optional(),
  lender: zNullableText(60).optional(),
  initialBalance: zNonNegativeAmount.optional(),
  openingDate: zIsoDate.optional(),
  monthlyPayment: zAmount.nullable().optional(),
  paymentDay: zDayOfMonth.nullable().optional(),
  icon: zIcon.optional(),
  color: zColor.optional(),
  isActive: z.boolean().optional(),
});

export const debtPaymentSchema = z.strictObject({
  accountId: zId,
  principal: zAmount,
  interest: zNonNegativeAmount.default(0),
  date: zIsoDate,
  description: zOptionalText(140),
});

export const debtDisbursementSchema = z.strictObject({
  accountId: zId,
  amount: zAmount,
  date: zIsoDate,
  description: zOptionalText(140),
});

export type DebtCreateInput = z.output<typeof debtCreateSchema>;
export type DebtUpdateInput = z.output<typeof debtUpdateSchema>;
export type DebtPaymentInput = z.output<typeof debtPaymentSchema>;
export type DebtDisbursementInput = z.output<typeof debtDisbursementSchema>;
