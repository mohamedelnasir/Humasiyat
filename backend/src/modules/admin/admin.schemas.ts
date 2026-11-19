import { z } from 'zod';

export const userIdParams = z.object({ id: z.uuid() });

export const setStatusSchema = z
  .object({
    status: z.enum(['active', 'suspended']),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .refine((v) => v.status !== 'suspended' || !!v.reason, {
    message: 'A reason is required when suspending an account',
    path: ['reason'],
  });
