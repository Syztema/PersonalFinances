import { z } from 'zod';
import { MAX_AMOUNT } from '../money';
import { DERIVED_METHODS, PAYMENT_METHODS, TRANSACTION_TYPES } from '../enums';
import { recurringOnCreateSchema } from './planning';
import { zAmount, zId, zIsoDate, zNonNegativeAmount, zOptionalText } from './common';

const zTags = z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]);
const zInstallments = z.number().int().min(1).max(48);
/** Spec con quién §2.3: con quién se gastó; ausente o null = sin indicar. */
const zCompanion = zId.nullish();

const base = {
  amount: zAmount,
  date: zIsoDate,
  description: zOptionalText(140),
  payee: zOptionalText(80),
  notes: zOptionalText(500),
  tags: zTags,
};

/** Solo al registrar: enlazar con una ocurrencia programada o crear la regla recurrente (spec 8.11). */
const linkFields = {
  scheduledItemId: zId.nullish(),
  recurring: recurringOnCreateSchema.nullish(),
};

const transferFields = { ...base, accountId: zId, toAccountId: zId, goalId: zId.nullish() };
const distinctAccounts = (v: { accountId: string; toAccountId: string }) =>
  v.accountId !== v.toAccountId;
const distinctMessage = {
  path: ['toAccountId'],
  message: 'La cuenta destino debe ser distinta de la de origen',
};

export const incomeSchema = z.strictObject({
  type: z.literal('INCOME'),
  ...base,
  ...linkFields,
  accountId: zId,
  categoryId: zId,
});
export const expenseSchema = z.strictObject({
  type: z.literal('EXPENSE'),
  ...base,
  ...linkFields,
  accountId: zId,
  categoryId: zId,
  paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
  companionId: zCompanion,
});
export const transferSchema = z
  .strictObject({ type: z.literal('TRANSFER'), ...transferFields })
  .refine(distinctAccounts, distinctMessage);
const cardPurchaseFields = {
  ...base,
  ...linkFields,
  creditCardId: zId,
  categoryId: zId,
  installments: zInstallments.default(1),
  companionId: zCompanion,
};
export const cardPurchaseSchema = z.strictObject({
  type: z.literal('CARD_PURCHASE'),
  ...cardPurchaseFields,
});
const cardPaymentFields = { ...base, creditCardId: zId, accountId: zId };
export const cardPaymentSchema = z.strictObject({
  type: z.literal('CARD_PAYMENT'),
  ...cardPaymentFields,
});
export const debtPaymentTxSchema = z.strictObject({
  type: z.literal('DEBT_PAYMENT'),
  ...base,
  debtId: zId,
  accountId: zId,
  interest: zNonNegativeAmount.default(0),
});
export const debtDisbursementTxSchema = z.strictObject({
  type: z.literal('DEBT_DISBURSEMENT'),
  ...base,
  debtId: zId,
  accountId: zId,
});

export const transactionSchema = z.discriminatedUnion('type', [
  incomeSchema,
  expenseSchema,
  transferSchema,
  cardPurchaseSchema,
  cardPaymentSchema,
  debtPaymentTxSchema,
  debtDisbursementTxSchema,
]);

export const transferBodySchema = z
  .strictObject(transferFields)
  .refine(distinctAccounts, distinctMessage);
const { creditCardId: _purchaseCard, ...purchaseBody } = cardPurchaseFields;
export const cardPurchaseBodySchema = z.strictObject(purchaseBody);
const { creditCardId: _paymentCard, ...paymentBody } = cardPaymentFields;
export const cardPaymentBodySchema = z.strictObject(paymentBody);

export const transactionListQuerySchema = z
  .object({
    from: zIsoDate.optional(),
    to: zIsoDate.optional(),
    type: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',') : undefined))
      .pipe(z.array(z.enum(TRANSACTION_TYPES)).optional()),
    categoryId: zId.optional(),
    accountId: zId.optional(),
    creditCardId: zId.optional(),
    debtId: zId.optional(),
    /** Una opción, o `none`: gastos sin compañía (spec con quién §3.2). */
    companionId: z.union([zId, z.literal('none')]).optional(),
    tag: z.string().trim().toLowerCase().max(30).optional(),
    method: z.enum(DERIVED_METHODS).optional(),
    minAmount: z.coerce.number().int().min(0).max(MAX_AMOUNT).optional(),
    maxAmount: z.coerce.number().int().min(0).max(MAX_AMOUNT).optional(),
    q: z.string().trim().max(80).optional(),
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ['to'],
    message: 'La fecha final debe ser igual o posterior a la inicial',
  });

export type TransactionInput = z.output<typeof transactionSchema>;
export type TransferBody = z.output<typeof transferBodySchema>;
export type CardPurchaseBody = z.output<typeof cardPurchaseBodySchema>;
export type CardPaymentBody = z.output<typeof cardPaymentBodySchema>;
export type TransactionListQuery = z.output<typeof transactionListQuerySchema>;
