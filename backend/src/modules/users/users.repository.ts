import type { Executor } from '../../database/db';
import type { UserRole, UserRow, UserStatus } from './users.types';

export interface NewUser {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  passwordHash: string;
  role?: UserRole;
  preferredLanguage?: 'ar' | 'en';
}

export const usersRepository = {
  async findById(db: Executor, id: string): Promise<UserRow | null> {
    const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  },

  async findByEmail(db: Executor, email: string): Promise<UserRow | null> {
    const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ?? null;
  },

  async findByPhone(db: Executor, phone: string): Promise<UserRow | null> {
    const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE phone = $1', [phone]);
    return rows[0] ?? null;
  },

  async create(db: Executor, input: NewUser): Promise<UserRow> {
    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (full_name, email, phone, password_hash, role, preferred_language)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.fullName,
        input.email ?? null,
        input.phone ?? null,
        input.passwordHash,
        input.role ?? 'customer',
        input.preferredLanguage ?? 'ar',
      ],
    );
    return rows[0]!;
  },

  async updatePassword(db: Executor, id: string, passwordHash: string): Promise<void> {
    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
  },

  async touchLastLogin(db: Executor, id: string): Promise<void> {
    await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
  },

  async setStatus(db: Executor, id: string, status: UserStatus, reason: string | null): Promise<UserRow> {
    const { rows } = await db.query<UserRow>(
      `UPDATE users SET status = $2, suspended_reason = $3 WHERE id = $1 RETURNING *`,
      [id, status, status === 'active' ? null : reason],
    );
    return rows[0]!;
  },
};
