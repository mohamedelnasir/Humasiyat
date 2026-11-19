import { loadMigrations } from './migrations';

/** In-process PostgreSQL (WASM) with the real migrations applied: no external DB needed for tests. */
export async function createMigratedDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
  const { citext } = await import('@electric-sql/pglite/contrib/citext');
  const db = new PGlite({ extensions: { btree_gist, citext } });
  for (const m of loadMigrations()) {
    await db.exec(m.up);
  }
  return db;
}
