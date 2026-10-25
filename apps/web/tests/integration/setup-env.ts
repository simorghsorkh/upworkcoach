import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, inject } from 'vitest';

/**
 * Runs in every integration test worker before the test file is imported.
 * The app reads its configuration lazily through getEnv(), so setting process.env here is
 * enough. https base URL → production-like `__Host-` cookies; one trusted proxy hop so tests
 * can choose the client IP through X-Forwarded-For.
 */
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_BASE_URL = 'https://app.test';
process.env.SESSION_COOKIE_NAME = '__Host-uc_session';
process.env.TRUSTED_PROXY_HOPS = '1';
process.env.DEVICE_COOKIE_SECRET = 'integration-only-device-cookie-secret-0123456789';
// Attachments go to a throwaway directory per worker, never to the dev .data/uploads.
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-test-uploads-'));
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_STORAGE_DIR = uploadDir;

afterAll(async () => {
  const { closeDb } = await import('@/server/db');
  await closeDb();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});
