import { z } from 'zod';
import { normalizePhone } from '../../utils/phone';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/\p{L}/u, 'Password must contain a letter')
  .regex(/\p{N}/u, 'Password must contain a digit');

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
      return z.NEVER;
    }
    return phone;
  });

const identifierSchema = z.string().trim().min(3).max(254);
const tokenSchema = z.string().min(20).max(200);

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: passwordSchema,
    preferredLanguage: z.enum(['ar', 'en']).default('ar'),
  })
  .strict()
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    message: 'Provide a phone number or an email address',
    path: ['phone'],
  });

export const loginSchema = z
  .object({ identifier: identifierSchema, password: z.string().min(1).max(128) })
  .strict();

export const refreshSchema = z.object({ refreshToken: tokenSchema }).strict();
export const logoutSchema = refreshSchema;
export const forgotPasswordSchema = z.object({ identifier: identifierSchema }).strict();
export const resetPasswordSchema = z.object({ token: tokenSchema, newPassword: passwordSchema }).strict();
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
