import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '../env';
import { logger } from '../logger';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** Creates a pool + Drizzle client. Used by the app singleton, scripts and tests. */
export function createDb(connectionString: string, options: { max?: number } = {}) {
  const pool = new Pool({ connectionString, max: options.max ?? 10 });
  pool.on('error', (err) => logger.error({ err }, 'postgres pool error'));
  const db: Db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool };
}

// Survive Next.js dev hot reloads without opening a new pool each time.
const globalForDb = globalThis as typeof globalThis & {
  __ucDb?: ReturnType<typeof createDb>;
};

/** The application's shared database client (lazy: nothing connects at import time). */
export function getDb(): Db {
  globalForDb.__ucDb ??= createDb(getEnv().DATABASE_URL);
  return globalForDb.__ucDb.db;
}

export async function closeDb(): Promise<void> {
  const current = globalForDb.__ucDb;
  globalForDb.__ucDb = undefined;
  await current?.pool.end();
}

/** A transaction handle as passed to `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Service and repo functions accept either the pool-backed client or a transaction. */
export type DbOrTx = Db | Tx;
