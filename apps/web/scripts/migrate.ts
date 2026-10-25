/**
 * pnpm db:migrate — applies SQL migrations from apps/web/drizzle to DATABASE_URL, then the
 * idempotent default data (stages, platforms, tracks; never overwrites admin edits).
 */
import { runMigrations } from '../src/server/db/migrate';
import { runSeed } from '../src/server/db/seed';
import { loadRootEnv } from './lib/env';

loadRootEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is not set (copy .env.example to .env)');
  process.exit(1);
}

await runMigrations(url);
const seeded = await runSeed(url);
console.info(`[migrate] database is up to date; seed added ${JSON.stringify(seeded)}`);
