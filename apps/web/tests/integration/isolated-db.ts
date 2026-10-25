import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDb } from '@/server/db';
import { runMigrations } from '@/server/db/migrate';
import { runSeed } from '@/server/db/seed';

/**
 * A fresh, migrated and seeded database for tests that change global state (access
 * settings, stage order, the seed itself). Other test files run in parallel against the
 * shared test database and must never see those changes. Services take `db` as their last
 * parameter, so tests call them directly with `isolated.db`.
 */
async function adminQuery(baseUrl: string, statement: string): Promise<void> {
  const url = new URL(baseUrl);
  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

export async function createIsolatedDb(prefix: string, options: { seed?: boolean } = {}) {
  const baseUrl = inject('databaseUrl');
  const name = `${prefix}_${randomBytes(4).toString('hex')}`;
  await adminQuery(baseUrl, `CREATE DATABASE ${name}`);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());
  if (options.seed !== false) await runSeed(url.toString());
  const handle = createDb(url.toString(), { max: 4 });
  return {
    db: handle.db,
    url: url.toString(),
    async drop() {
      await handle.pool.end();
      await adminQuery(baseUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    },
  };
}
