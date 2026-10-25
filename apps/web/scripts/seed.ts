/**
 * pnpm db:seed — inserts the default catalog rows that are missing (9 stages of
 * learning-path.md, tracks B/C/D, platform list). Idempotent; never overwrites edits.
 * `pnpm db:migrate` already runs it; this script is for re-running it alone.
 */
import { runSeed } from '../src/server/db/seed';
import { loadRootEnv } from './lib/env';

loadRootEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[seed] DATABASE_URL is not set (copy .env.example to .env)');
  process.exit(1);
}

const seeded = await runSeed(url);
console.info(`[seed] done; rows added: ${JSON.stringify(seeded)}`);
