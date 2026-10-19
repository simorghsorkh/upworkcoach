import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/** Walks up from `start` until it finds the pnpm workspace root. */
function findRepoRoot(start: string): string {
  let dir = start;
  while (!fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
  return dir;
}

const repoRoot = findRepoRoot(process.cwd());

// Local development keeps a single `.env` at the repo root (see README).
// In production the real environment is used; this file is absent there.
// Existing environment variables are never overwritten.
const rootEnvFile = path.join(repoRoot, '.env');
if (fs.existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

// Relative LOCAL_STORAGE_DIR (e.g. `.data/uploads`) is relative to the repo root in dev.
const localStorageDir = process.env.LOCAL_STORAGE_DIR;
if (localStorageDir && !path.isAbsolute(localStorageDir)) {
  process.env.LOCAL_STORAGE_DIR = path.join(repoRoot, localStorageDir);
}

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace files from the workspace root so the standalone bundle is complete.
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  reactStrictMode: true,
  // Node-only server libraries: keep them out of the bundle.
  serverExternalPackages: ['pg', 'pg-boss', 'pino'],
};

export default nextConfig;
