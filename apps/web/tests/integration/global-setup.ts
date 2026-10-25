import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { initCluster, startCluster, stopCluster } from '../../scripts/lib/embedded-pg';
import { runMigrations } from '../../src/server/db/migrate';
import { runSeed } from '../../src/server/db/seed';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

/**
 * Integration tests get their own throwaway database (never the dev database in .data/pg):
 *  - CI: TEST_DATABASE_URL points to a disposable Postgres service container.
 *  - Local: a temporary Postgres 16 cluster from embedded-postgres (ADR-0009),
 *    deleted after the run.
 */
export default async function setup(project: TestProject) {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    await runMigrations(external);
    await runSeed(external);
    project.provide('databaseUrl', external);
    return;
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-test-pg-'));
  const clusterDir = path.join(dataDir, 'data');
  const port = await freePort();
  const user = 'uc_test';
  const password = 'uc_test_local_only';
  await initCluster({ dataDir: clusterDir, user, password });
  await startCluster({ dataDir: clusterDir, port, logFile: path.join(dataDir, 'pg.log') });

  const url = `postgres://${user}:${password}@localhost:${port}/postgres`;
  await runMigrations(url);
  await runSeed(url);
  project.provide('databaseUrl', url);

  return async () => {
    await stopCluster(clusterDir);
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  };
}
