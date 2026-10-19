/** pnpm db:stop — gracefully stops the local embedded Postgres started by db:start. */
import path from 'node:path';
import { isRunning, stopCluster } from './lib/embedded-pg';
import { repoRoot } from './lib/env';

const dataDir = path.join(repoRoot, '.data', 'pg');

if (await isRunning(dataDir)) {
  await stopCluster(dataDir);
  console.info('[db] stopped');
} else {
  console.info('[db] not running');
}
