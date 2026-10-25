import fs from 'node:fs';
import { isRunning, stopCluster } from '../../scripts/lib/embedded-pg';
import { readState, stateFile } from './server/state';

/**
 * Stops the e2e Postgres even when the web server was force-killed (Windows kills the process
 * tree, but postgres is detached by pg_ctl), then deletes its data directory.
 */
export default async function globalTeardown() {
  const state = readState();
  if (!state) return;
  try {
    if (await isRunning(state.clusterDir)) await stopCluster(state.clusterDir);
  } catch (err) {
    console.error('[e2e] could not stop Postgres', err);
  }
  fs.rmSync(state.dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  fs.rmSync(stateFile, { force: true });
}
