import { z } from 'zod';

export const tagUpdateSchema = z.strictObject({
  name: z.string().trim().toLowerCase().min(1, 'Requerido').max(30),
});

export type TagUpdateInput = z.output<typeof tagUpdateSchema>;
