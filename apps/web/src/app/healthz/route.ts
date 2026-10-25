import { sql } from 'drizzle-orm';
import { getHealthFreshness } from '@/modules/health/recompute';
import { getDb } from '@/server/db';
import { logger, safeError } from '@/server/logger';

// Liveness + database check for uptime monitoring and the container HEALTHCHECK (which only
// looks at the HTTP status). Contract SEC-J4 / api.md section 15 (followup F-08):
//   200 { ok: true, db: 'ok', lastHealthSweepAt, version, sweepStale }
//   503 { ok: false, db: 'fail' }
// `sweepStale` = the oldest health result of an active/paused student is older than 3 hours
// (ADR-0005, ADR-0007): the hourly `health.sweep` is not running — alert on it (devops).
// Never an error message, connection string or stack in the body (SEC-J4).
export const dynamic = 'force-dynamic';

/** Build identifier (e.g. the commit SHA passed as APP_VERSION at image build). */
function appVersion(): string {
  const value = process.env.APP_VERSION?.trim();
  return value && /^[\w.+-]{1,64}$/.test(value) ? value : 'dev';
}

export async function GET(): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    const freshness = await getHealthFreshness(db);
    return Response.json(
      {
        ok: true,
        db: 'ok',
        lastHealthSweepAt: freshness.lastHealthSweepAt?.toISOString() ?? null,
        version: appVersion(),
        sweepStale: freshness.stale,
      },
      { headers },
    );
  } catch (err) {
    // Only type, SQLSTATE and constraint (F-17: never query parameters).
    logger.error(
      { event: 'healthz.db_failed', error: safeError(err) },
      'healthz: database check failed',
    );
    return Response.json({ ok: false, db: 'fail' }, { status: 503, headers });
  }
}
