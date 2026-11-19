import { createApp } from '../../src/app';
import { setDatabase, type Database, type Executor } from '../../src/database/db';
import { hashPassword } from '../../src/modules/auth/password.service';
import { usersRepository } from '../../src/modules/users/users.repository';
import type { UserRole } from '../../src/modules/users/users.types';
import { createMigratedDb } from './testDb';

type PGliteInstance = Awaited<ReturnType<typeof createMigratedDb>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrap = (source: { query: (text: string, params?: any[]) => Promise<any> }): Executor => ({
  async query(text, params) {
    const result = await source.query(text, params as unknown[]);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  },
});

export const pgliteDatabase = (pg: PGliteInstance): Database => ({
  ...wrap(pg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: (fn) => pg.transaction((tx: any) => fn(wrap(tx))),
});

/** Real SQL + real HTTP stack, in-process PostgreSQL. Call reset() in beforeEach. */
export async function setupTestApp() {
  const pg = await createMigratedDb();
  const database = pgliteDatabase(pg);
  setDatabase(database);
  const app = createApp();

  const reset = async () => {
    await pg.exec('TRUNCATE users, activity_logs RESTART IDENTITY CASCADE');
  };

  const createUser = async (input: { role?: UserRole; email?: string; phone?: string; password?: string; fullName?: string }) =>
    usersRepository.create(database, {
      fullName: input.fullName ?? 'Test User',
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(input.password ?? 'Password1'),
      role: input.role ?? 'customer',
    });

  return { app, pg, db: database, reset, createUser, close: () => pg.close() };
}
