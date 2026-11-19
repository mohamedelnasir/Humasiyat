import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';
import { logger } from '../config/logger';

function sslConfig() {
  if (!env.DATABASE_SSL) return undefined;
  if (env.DATABASE_SSL_CA) return { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true };
  logger.warn('DATABASE_SSL=true without DATABASE_SSL_CA: server certificate is NOT verified');
  return { rejectUnauthorized: false };
}

// The pool connects lazily, so importing this module never requires a live database.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: sslConfig(),
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle database client');
});

export type Queryable = Pick<Pool | PoolClient, 'query'>;

export function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  executor: Queryable = pool,
): Promise<QueryResult<R>> {
  return executor.query<R>(text, params);
}

export async function checkDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closePool(): Promise<void> {
  await pool.end();
}
