import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { logger } from '@/server/logger';

// Liveness + database check for uptime monitoring and the container HEALTHCHECK.
// ADR-0007: later also returns the time of the last successful `health.sweep`.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const headers = { 'cache-control': 'no-store' };
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: 'ok', db: 'ok' }, { headers });
  } catch (err) {
    logger.error({ err }, 'healthz: database check failed');
    return Response.json({ status: 'error', db: 'unreachable' }, { status: 503, headers });
  }
}
