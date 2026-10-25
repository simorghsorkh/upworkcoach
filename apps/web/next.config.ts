import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import {
  STATIC_SECURITY_HEADERS,
  TOKEN_PAGE_HEADERS,
  TOKEN_PAGE_PATHS,
} from './src/server/http/security-headers';

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
  // SEC-H2: no X-Powered-By.
  poweredByHeader: false,
  reactStrictMode: true,
  // SEC-H5: no image optimisation from other domains.
  images: { remotePatterns: [] },
  // Node-only server libraries: keep them out of the bundle.
  serverExternalPackages: ['pg', 'pg-boss', 'pino', '@node-rs/argon2'],
  async headers() {
    return [
      // SEC-H2 on every response (pages, API, static assets). The page CSP with a nonce is
      // added per request in src/proxy.ts; API responses set their own CSP.
      { source: '/:path*', headers: [...STATIC_SECURITY_HEADERS] },
      // SEC-T3: invite/reset pages carry the token in the URL fragment.
      ...TOKEN_PAGE_PATHS.map((source) => ({ source, headers: [...TOKEN_PAGE_HEADERS] })),
    ];
  },
};

export default nextConfig;
