import type { PgBoss } from 'pg-boss';
import { getEnv } from '../env';
import { logger } from '../logger';

/**
 * Background jobs with pg-boss on the same Postgres (ADR-0007).
 *
 * JOBS_MODE:
 *   in-process   — start pg-boss inside the web server (Azure / Iranian VPS default)
 *   http-trigger — no worker; an external scheduler calls POST /api/internal/jobs/:name
 *                  (route is added together with the first job)
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
 * Registered jobs. Empty in the skeleton — 0.1 adds `health.sweep`, `auth.cleanup`
 * and `files.cleanup` here (ADR-0007 table).
 */
export const jobs: JobDefinition[] = [];

const globalForJobs = globalThis as typeof globalThis & { __ucBoss?: PgBoss };

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
