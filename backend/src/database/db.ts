import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { pool } from './pool';
import { withTransaction } from './transaction';

export interface QueryResultLike<R> {
  rows: R[];
  rowCount: number;
}

/** Anything repositories can run SQL against: the pool, or a transaction. */
export interface Executor {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResultLike<R>>;
}

export interface Database extends Executor {
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
}

function wrap(source: Pick<Pool | PoolClient, 'query'>): Executor {
  return {
    async query<R extends QueryResultRow>(text: string, params?: unknown[]) {
      const result = await source.query<R>(text, params);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

const pgDatabase: Database = {
  ...wrap(pool),
  transaction: (fn) => withTransaction((client) => fn(wrap(client))),
};

let current: Database = pgDatabase;

/** Replace the driver (tests run the real SQL against an in-process PostgreSQL). */
export function setDatabase(database: Database): void {
  current = database;
}

/** The application database. Repositories receive an Executor, services call db.transaction(). */
export const db: Database = {
  query: (text, params) => current.query(text, params),
  transaction: (fn) => current.transaction(fn),
};
