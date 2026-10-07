import type { IsoDate } from '@finanzas/shared';

/** `DATE` de Postgres ↔ `YYYY-MM-DD` (Prisma lo entrega como medianoche UTC). */
export const toDbDate = (iso: IsoDate): Date => new Date(`${iso}T00:00:00.000Z`);
export const fromDbDate = (date: Date): IsoDate => date.toISOString().slice(0, 10);

/** `bigint` de Prisma → `number` (exacto hasta 9×10¹⁵). */
export const num = (value: bigint | number | null | undefined): number =>
  value == null ? 0 : Number(value);
