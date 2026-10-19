import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (the directory with pnpm-workspace.yaml). */
export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** apps/web */
export const webRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Loads `<repo>/.env` without overwriting variables that are already set. */
export function loadRootEnv(): void {
  const file = path.join(repoRoot, '.env');
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

/** Default local URL — same as .env.example. Not a secret: local-only embedded database. */
export const DEFAULT_LOCAL_DATABASE_URL =
  'postgres://upworkcoach:upworkcoach@localhost:5432/upworkcoach';
