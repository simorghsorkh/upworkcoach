import type { PgBoss } from 'pg-boss';
import { getEnv } from '../env';
import { logger } from '../logger';

/**
 * Background jobs with pg-boss on the same Postgres (ADR-0007).
 *
 * JOBS_MODE:
 *   in-process   — start pg-boss inside the web server (Azure / Iranian VPS default)
 *   http-trigger — no worker; an external scheduler calls POST /api/internal/jobs/:name
 *                  (src/app/api/internal/jobs/[name]/route.ts; SEC-J1..J3)
 *   off          — nothing runs (tests, e2e)
 */
export type JobDefinition = {
  /** Queue name, e.g. `health.sweep`. */
  name: string;
  /** Cron expression evaluated in Asia/Tehran. Omit for on-demand jobs. */
  cron?: string;
  /** Must be idempotent; normally a plain service function. */
  handler: () => Promise<void>;
};

/**
 * Registered jobs (ADR-0007 table). The names are also the whitelist of the internal
 * trigger endpoint (SEC-J3).
 */
export const jobs: JobDefinition[] = [
  {
    // Every hour at minute 5 (Tehran): health of all active and paused students, and the
    // automatic return of expired pauses (ADR-0005).
    name: 'health.sweep',
    cron: '5 * * * *',
    handler: async () => {
      const { sweepAllHealth } = await import('../../modules/health/recompute');
      await sweepAllHealth();
    },
  },
  {
    // Sessions/tokens expired for 7+ days, stale throttle rows, audit_log retention
    // (data-model.md 6-1, ADR-0010).
    name: 'auth.cleanup',
    cron: '30 3 * * *',
    handler: async () => {
      const { cleanupAuthData } = await import('../../modules/identity/service');
      await cleanupAuthData();
    },
  },
  {
    // Pending (never linked) attachments older than 24 hours: object, then row
    // (data-model.md 2-5 and 6-1). Also retries files left behind by account erasure.
    name: 'files.cleanup',
    cron: '45 3 * * *',
    handler: async () => {
      const { cleanupPendingAttachments } = await import('../../modules/files/service');
      await cleanupPendingAttachments();
    },
  },
];

const globalForJobs = globalThis as typeof globalThis & { __ucBoss?: PgBoss };

/** Runs one registered job by name (http-trigger mode); false for an unknown name. */
export async function runJobByName(name: string): Promise<boolean> {
  const job = jobs.find((j) => j.name === name);
  if (!job) return false;
  await job.handler();
  return true;
}

export async function startJobs(): Promise<void> {
  const env = getEnv();
  if (env.JOBS_MODE !== 'in-process') {
    logger.info({ jobsMode: env.JOBS_MODE }, 'jobs: in-process worker disabled');
    return;
  }
  if (globalForJobs.__ucBoss) return;

  const { PgBoss } = await import('pg-boss');
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();
  globalForJobs.__ucBoss = boss;

  for (const job of jobs) {
    await boss.createQueue(job.name);
    await boss.work(job.name, async () => {
      await job.handler();
    });
    if (job.cron) {
      await boss.schedule(job.name, job.cron, null, { tz: 'Asia/Tehran' });
    }
  }
  logger.info({ jobs: jobs.map((job) => job.name) }, 'jobs: pg-boss started');
}

export async function stopJobs(): Promise<void> {
  const boss = globalForJobs.__ucBoss;
  globalForJobs.__ucBoss = undefined;
  await boss?.stop({ graceful: true });
}
