import { createHash, timingSafeEqual } from 'node:crypto';
import {
  lockRemainingSeconds,
  readThrottleStates,
  registerFailure,
} from '../../modules/identity/throttle';
import { getDb } from '../db';
import { getEnv } from '../env';
import { API_CSP } from '../http/security-headers';
import { logger } from '../logger';
import { jobs, runJobByName } from './index';

/**
 * `POST /api/internal/jobs/:name` (ADR-0007 `JOBS_MODE=http-trigger`, security.md SEC-J1..J3).
 *  - Any other JOBS_MODE → 404, whatever the headers.
 *  - `X-Job-Secret` compared in constant time on SHA-256 digests; wrong or missing → 404
 *    (not 401) and a warning log. A short secret cannot even start the app (env.ts, SEC-J1).
 *  - `:name` from the registered job list only; the body is ignored (SEC-J3).
 *  - At most 60 calls an hour (shared counter in `auth_throttle`).
 * No session and no Origin check: only this exact path prefix is exempt.
 */

const RULE = { threshold: 60, windowMs: 3600_000, lockMs: 3600_000 } as const;
const KEY = 'jobs:trigger';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'content-security-policy': API_CSP,
      'x-content-type-options': 'nosniff',
    },
  });
}

const notFound = () => json(404, { error: { code: 'NOT_FOUND', message: 'پیدا نشد.' } });

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/** Constant-time comparison of the presented secret (SEC-J2). */
export function secretMatches(presented: string | null, secret: string | undefined): boolean {
  if (!presented || !secret || secret.length < 32) return false;
  return timingSafeEqual(digest(presented), digest(secret));
}

export async function handleJobTrigger(req: Request, name: string): Promise<Response> {
  const env = getEnv();
  if (env.JOBS_MODE !== 'http-trigger') return notFound();
  if (!secretMatches(req.headers.get('x-job-secret'), env.JOB_TRIGGER_SECRET)) {
    logger.warn({ event: 'jobs.trigger_rejected' }, 'job trigger with a wrong secret');
    return notFound();
  }
  if (!jobs.some((j) => j.name === name)) return notFound();
  const db = getDb();
  const now = new Date();
  const locked = lockRemainingSeconds((await readThrottleStates(db, [KEY])).get(KEY), now);
  if (locked > 0) {
    return json(429, {
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'تلاش‌ها زیاد بود.', retryAfterSeconds: locked },
    });
  }
  await registerFailure(db, KEY, RULE, now);
  const started = performance.now();
  await runJobByName(name);
  logger.info(
    { event: 'jobs.triggered', job: name, ms: Math.round(performance.now() - started) },
    'job run by trigger',
  );
  return json(200, { ok: true, job: name });
}
