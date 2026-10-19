/**
 * pnpm db:start — starts a local Postgres 16 (embedded-postgres binaries, no Docker).
 * Data lives in <repo>/.data/pg and survives restarts. Stop with `pnpm db:stop`.
 */
import path from 'node:path';
import {
  ensureDatabase,
  initCluster,
  isRunning,
  parseLocalDatabaseUrl,
  startCluster,
} from './lib/embedded-pg';
import { DEFAULT_LOCAL_DATABASE_URL, loadRootEnv, repoRoot } from './lib/env';

loadRootEnv();
const url = process.env.DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
const { user, password, port, database } = parseLocalDatabaseUrl(url);
const dataDir = path.join(repoRoot, '.data', 'pg');
const logFile = path.join(repoRoot, '.data', 'pg.log');

if (!user || !password || !database) {
  throw new Error('DATABASE_URL must include user, password and database name');
}

if (await initCluster({ dataDir, user, password })) {
  console.info(`[db] initialised new cluster in ${dataDir}`);
}

if (await isRunning(dataDir)) {
  console.info('[db] already running');
} else {
  await startCluster({ dataDir, port, logFile });
}

if (await ensureDatabase({ port, user, password, database })) {
  console.info(`[db] created database "${database}"`);
}

console.info(`[db] Postgres 16 is ready on localhost:${port} (database "${database}")`);
console.info(`[db] server log: ${logFile}`);
console.info('[db] next: pnpm db:migrate — stop with: pnpm db:stop');
