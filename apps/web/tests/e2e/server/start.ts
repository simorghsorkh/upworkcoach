/**
 * Playwright web server for the e2e suite: a throwaway Postgres 16 (embedded, ADR-0009) with
 * migrations + seed and one active admin, then `next dev` on the e2e port.
 * Never touches the dev database (.data/pg, port 5432).
 *
 * The cluster outlives a force-killed process tree on Windows (pg_ctl detaches postgres), so
 * its data directory is written to the state file and `global-teardown.ts` stops it.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCluster, startCluster, stopCluster } from '../../../scripts/lib/embedded-pg';
import { E2E_ADMIN, E2E_PORT, type E2EState, stateFile } from './state';

const webRoot = fileURLToPath(new URL('../../../', import.meta.url));

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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-e2e-pg-'));
const clusterDir = path.join(dataDir, 'data');
const user = 'uc_e2e';
const password = 'uc_e2e_local_only';
const port = await freePort();
const databaseUrl = `postgres://${user}:${password}@localhost:${port}/postgres`;
const baseUrl = `http://localhost:${E2E_PORT}`;

let child: ChildProcess | null = null;
let stopping = false;

async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  child?.kill();
  try {
    await stopCluster(clusterDir);
  } catch {
    // already stopped
  }
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  fs.rmSync(stateFile, { force: true });
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => void shutdown(0));
}

try {
  await initCluster({ dataDir: clusterDir, user, password });
  await startCluster({ dataDir: clusterDir, port, logFile: path.join(dataDir, 'pg.log') });
  const state: E2EState = { dataDir, clusterDir, databaseUrl, admin: E2E_ADMIN };
  fs.writeFileSync(stateFile, JSON.stringify(state));

  process.env.DATABASE_URL = databaseUrl;
  process.env.APP_BASE_URL = baseUrl;
  process.env.JOBS_MODE = 'off';
  process.env.LOG_LEVEL = 'warn';

  const { runMigrations } = await import('../../../src/server/db/migrate');
  const { runSeed } = await import('../../../src/server/db/seed');
  await runMigrations(databaseUrl);
  await runSeed(databaseUrl);

  // First admin through the real services: bootstrap (invite) + accept with a known password.
  const identity = await import('../../../src/modules/identity/service');
  const { closeDb } = await import('../../../src/server/db');
  const boot = await identity.bootstrapAdmin({
    phone: E2E_ADMIN.phone,
    displayName: E2E_ADMIN.displayName,
  });
  const token = new URL(boot.setupUrl).hash.replace(/^#t=/, '');
  await identity.acceptToken(
    { token, phone: E2E_ADMIN.phone, password: E2E_ADMIN.password },
    { ip: '127.0.0.1', userAgent: 'e2e-setup' },
  );
  await closeDb();
} catch (err) {
  console.error('[e2e] setup failed', err);
  await shutdown(1);
}

const nextBin = path.join(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
/**
 * `E2E_ISOLATED=1`: run the suite next to another `next dev` of this app (which holds the
 * lock of `.next/dev`). Next has no switch for the build directory, so a snapshot of the app
 * (src, public, configs) is copied to `.next/e2e-app` (git- and lint-ignored, outside the
 * tsconfig includes) and `next dev` runs there; node_modules resolve from apps/web as usual.
 */
let appDir = webRoot;
if (process.env.E2E_ISOLATED === '1') {
  appDir = path.join(webRoot, '.next', 'e2e-app');
  fs.rmSync(path.join(appDir, 'src'), { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  for (const entry of [
    'src',
    'public',
    'next.config.ts',
    'tsconfig.json',
    'postcss.config.mjs',
    'package.json',
    'next-env.d.ts',
  ]) {
    const from = path.join(webRoot, entry);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(appDir, entry), { recursive: true });
  }
}
const args = [nextBin, 'dev', '--port', String(E2E_PORT)];
child = spawn(process.execPath, args, {
  cwd: appDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    APP_BASE_URL: baseUrl,
    JOBS_MODE: 'off',
    LOG_LEVEL: 'warn',
  },
});
child.on('exit', (code) => void shutdown(code ?? 0));
