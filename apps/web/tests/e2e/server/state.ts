import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Shared between the e2e web server, the specs and the global teardown. */
export const E2E_PORT = 3100;

/** Local-only test account in the throwaway e2e database. */
export const E2E_ADMIN = {
  phone: '09120000099',
  displayName: 'مربی آزمون',
  password: 'e2e-admin-password-0123',
} as const;

export type E2EState = {
  dataDir: string;
  clusterDir: string;
  databaseUrl: string;
  admin: typeof E2E_ADMIN;
};

export const stateFile = path.join(os.tmpdir(), `uc-e2e-${E2E_PORT}.json`);

export function readState(): E2EState | null {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8')) as E2EState;
  } catch {
    return null;
  }
}
