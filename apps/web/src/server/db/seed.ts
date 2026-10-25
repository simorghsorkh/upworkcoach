import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { type SeedResult, seedCatalogDefaults } from '../../modules/catalog/seed';
import * as schema from './schema';

/**
 * Applies the idempotent default data (catalog seed) in one transaction.
 * Shared by `pnpm db:migrate` (after the SQL migrations), `pnpm db:seed` and the
 * integration-test setup. Safe to run any number of times.
 */
export async function runSeed(connectionString: string): Promise<SeedResult> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    return await db.transaction((tx) => seedCatalogDefaults(tx));
  } finally {
    await pool.end();
  }
}
