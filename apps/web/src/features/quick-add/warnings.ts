import type { WarningCode } from '@finanzas/shared';

export const WARNING_MESSAGES: Record<WarningCode, string> = {
  NEGATIVE_BALANCE:
    'Ojo: la cuenta quedó con saldo negativo. ¿Falta registrar un ingreso o una transferencia?',
  OVER_CREDIT_LIMIT:
    'La compra supera el cupo disponible de la tarjeta. Revisa el cupo registrado.',
  BEFORE_OPENING_DATE:
    'La fecha es anterior a la apertura de la cuenta: su saldo inicial ya podría incluir este movimiento.',
};
