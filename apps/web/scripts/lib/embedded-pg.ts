import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

/**
 * Thin wrapper around the Postgres 16 binaries shipped by the `embedded-postgres`
 * npm package (ADR-0009). We call initdb/pg_ctl directly so the server runs in the
 * background and stops gracefully (`pg_ctl stop -m fast`) on every OS.
 */

type Binaries = { initdb: string; pg_ctl: string; postgres: string };

const PLATFORM_PACKAGES: Record<string, string> = {
  'win32-x64': '@embedded-postgres/windows-x64',
  'linux-x64': '@embedded-postgres/linux-x64',
  'linux-arm64': '@embedded-postgres/linux-arm64',
  'darwin-x64': '@embedded-postgres/darwin-x64',
  'darwin-arm64': '@embedded-postgres/darwin-arm64',
};

export async function getBinaries(): Promise<Binaries> {
  const key = `${process.platform}-${process.arch}`;
  const pkg = PLATFORM_PACKAGES[key];
  if (!pkg) throw new Error(`embedded Postgres is not available for ${key}`);
  // The platform package is a dependency of `embedded-postgres`, so resolve it from there.
  const fromHere = createRequire(import.meta.url);
  const fromEmbedded = createRequire(fromHere.resolve('embedded-postgres'));
  const binaries = (await import(pathToFileURL(fromEmbedded.resolve(pkg)).href)) as Binaries;
  if (process.platform !== 'win32') {
    for (const bin of Object.values(binaries)) fs.chmodSync(bin, 0o755);
  }
  return binaries;
}

function run(
  bin: string,
  args: string[],
  label: string,
  stdio: 'inherit' | 'ignore' = 'inherit',
): void {
  const result = spawnSync(bin, args, { stdio });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

export async function initCluster(opts: {
  dataDir: string;
  user: string;
  password: string;
}): Promise<boolean> {
  if (fs.existsSync(path.join(opts.dataDir, 'PG_VERSION'))) return false;
  const { initdb } = await getBinaries();
  fs.mkdirSync(path.dirname(opts.dataDir), { recursive: true });
  const pwDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-pw-'));
  const pwFile = path.join(pwDir, 'pw');
  fs.writeFileSync(pwFile, opts.password, { mode: 0o600 });
  try {
    run(
      initdb,
      [
        '-D',
        opts.dataDir,
        '-U',
        opts.user,
        `--pwfile=${pwFile}`,
        '--auth=scram-sha-256',
        '--encoding=UTF8',
        '--locale=C',
        '--no-instructions',
      ],
      'initdb',
    );
  } finally {
    fs.rmSync(pwDir, { recursive: true, force: true });
  }
  return true;
}

export async function isRunning(dataDir: string): Promise<boolean> {
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) return false;
  const { pg_ctl } = await getBinaries();
  return spawnSync(pg_ctl, ['status', '-D', dataDir], { stdio: 'ignore' }).status === 0;
}

export async function startCluster(opts: {
  dataDir: string;
  port: number;
  logFile: string;
}): Promise<void> {
  const { pg_ctl } = await getBinaries();
  try {
    run(
      pg_ctl,
      [
        'start',
        '-D',
        opts.dataDir,
        '-l',
        opts.logFile,
        '-w',
        '-t',
        '60',
        '-o',
        `-p ${opts.port} -c listen_addresses=localhost -c TimeZone=UTC`,
      ],
      'pg_ctl start',
      // No inherited handles: the long-running postgres child would otherwise keep our
      // stdout/stderr open, and whatever reads them (pipe, CI, IDE task) would hang.
      // Server output goes to logFile.
      'ignore',
    );
  } catch (err) {
    const log = fs.existsSync(opts.logFile) ? fs.readFileSync(opts.logFile, 'utf8') : '';
    console.error(log.split('\n').slice(-15).join('\n'));
    throw err;
  }
}

export async function stopCluster(dataDir: string): Promise<void> {
  const { pg_ctl } = await getBinaries();
  run(pg_ctl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '60'], 'pg_ctl stop');
}

export async function ensureDatabase(opts: {
  port: number;
  user: string;
  password: string;
  database: string;
}): Promise<boolean> {
  const client = new pg.Client({
    host: 'localhost',
    port: opts.port,
    user: opts.user,
    password: opts.password,
    database: 'postgres',
  });
  await client.connect();
  try {
    const existing = await client.query('select 1 from pg_database where datname = $1', [
      opts.database,
    ]);
    if (existing.rowCount) return false;
    await client.query(`create database ${pg.escapeIdentifier(opts.database)}`);
    return true;
  } finally {
    await client.end();
  }
}

export function parseLocalDatabaseUrl(url: string) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(
      `DATABASE_URL points to "${parsed.hostname}". db:start only manages a local embedded Postgres.`,
    );
  }
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    port: Number(parsed.port || 5432),
    database: parsed.pathname.replace(/^\//, ''),
  };
}
