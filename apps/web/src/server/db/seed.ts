import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { type SeedResult, seedCatalogDefaults } from '../../modules/catalog/seed';
import { organizations } from '../../modules/identity/schema';
import * as schema from './schema';

/**
 * Applies the idempotent default data (catalog seed of every organization) in one
 * transaction. Shared by `pnpm db:migrate` (after the SQL migrations), `pnpm db:seed` and
 * the integration-test setup. Safe to run any number of times. Returns the sum of rows
 * added.
 */
export async function runSeed(connectionString: string): Promise<SeedResult> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    return await db.transaction(async (tx) => {
      const orgs = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .orderBy(organizations.createdAt);
      let total: SeedResult | null = null;
      for (const org of orgs) {
        const result = await seedCatalogDefaults(tx, org.id);
        const sum: SeedResult | null = total;
        total = sum
          ? (Object.fromEntries(
              (Object.keys(sum) as (keyof SeedResult)[]).map((k) => [k, sum[k] + result[k]]),
            ) as SeedResult)
          : result;
      }
      // Migration 0006 creates the default organization, so there is always one.
      return total ?? seedCatalogDefaults(tx);
    });
  } finally {
    await pool.end();
  }
}
