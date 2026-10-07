import { z } from 'zod';
import { THEMES } from '../enums';
import { zName } from './common';

export const zEmail = z.string().trim().toLowerCase().pipe(z.email('Email inválido').max(254));
export const zPassword = z.string().min(8, 'Mínimo 8 caracteres').max(128, 'Máximo 128 caracteres');

export const registerSchema = z.strictObject({
  name: zName(80),
  email: zEmail,
  password: zPassword,
});
export const loginSchema = z.strictObject({ email: zEmail, password: z.string().min(1).max(128) });
export const forgotPasswordSchema = z.strictObject({ email: zEmail });
export const resetPasswordSchema = z.strictObject({
  token: z.string().min(20).max(200),
  password: zPassword,
});
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: zPassword,
});
export const updateMeSchema = z.strictObject({
  name: zName(80).optional(),
  theme: z.enum(THEMES).optional(),
});

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.output<typeof changePasswordSchema>;
export type UpdateMeInput = z.output<typeof updateMeSchema>;
