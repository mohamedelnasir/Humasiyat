/**
 * Creates the first Super Admin. Run once per environment:
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='...' npm run seed:admin
 * Credentials come from the environment only; nothing is committed or hardcoded.
 */
import { z } from 'zod';
import { db } from '../database/db';
import { closePool } from '../database/pool';
import { passwordSchema } from '../modules/auth/auth.schemas';
import { hashPassword } from '../modules/auth/password.service';
import { usersRepository } from '../modules/users/users.repository';
import { logActivity } from '../services/activityLog';
import { normalizePhone } from '../utils/phone';

const input = z
  .object({
    SEED_ADMIN_NAME: z.string().trim().min(2).default('Super Admin'),
    SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()).optional(),
    SEED_ADMIN_PHONE: z.string().trim().min(5).optional(),
    SEED_ADMIN_PASSWORD: passwordSchema,
  })
  .refine((v) => v.SEED_ADMIN_EMAIL || v.SEED_ADMIN_PHONE, { message: 'Set SEED_ADMIN_EMAIL or SEED_ADMIN_PHONE' });

async function main() {
  const parsed = input.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid seed configuration:');
    for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }
  const cfg = parsed.data;
  const phone = cfg.SEED_ADMIN_PHONE ? normalizePhone(cfg.SEED_ADMIN_PHONE) : undefined;
  if (cfg.SEED_ADMIN_PHONE && !phone) {
    console.error('SEED_ADMIN_PHONE is not a valid phone number');
    process.exitCode = 1;
    return;
  }

  const existing =
    (cfg.SEED_ADMIN_EMAIL && (await usersRepository.findByEmail(db, cfg.SEED_ADMIN_EMAIL))) ||
    (phone && (await usersRepository.findByPhone(db, phone)));
  if (existing) {
    console.log(`An account with these details already exists (role: ${existing.role}). Nothing changed.`);
    return;
  }

  const passwordHash = await hashPassword(cfg.SEED_ADMIN_PASSWORD);
  const user = await db.transaction(async (tx) => {
    const created = await usersRepository.create(tx, {
      fullName: cfg.SEED_ADMIN_NAME,
      email: cfg.SEED_ADMIN_EMAIL,
      phone,
      passwordHash,
      role: 'super_admin',
    });
    await logActivity(tx, { action: 'user.super_admin_seeded', entityType: 'user', entityId: created.id });
    return created;
  });
  console.log(`Super admin created: ${user.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
