import type { PoolClient } from 'pg';
import { pool } from './pool';

export type IsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  /** Retries for serialization failures (40001) and deadlocks (40P01). */
  maxRetries?: number;
}

const RETRYABLE = new Set(['40001', '40P01']);

/**
 * Runs `fn` inside a transaction. Repositories receive the same client so every
 * statement of a business operation shares one transaction. The whole function is
 * retried on serialization failures / deadlocks, so `fn` must be free of side
 * effects outside the database (send notifications AFTER the transaction commits).
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const { isolationLevel = 'READ COMMITTED', maxRetries = 3 } = options;

  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* connection may already be broken; original error matters more */
      }
      const code = (err as { code?: string }).code;
      if (code && RETRYABLE.has(code) && attempt < maxRetries) continue;
      throw err;
    } finally {
      client.release();
    }
  }
}
