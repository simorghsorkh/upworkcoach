import { and, eq, lte } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { recordTimelineEvent } from '../timeline/events';
import { students } from './schema';

/**
 * Automatic return from a pause (data-model.md 3-2, ADR-0005): when `paused_until` has come
 * (a Tehran day ≤ today), the hourly `health.sweep` sets the student back to `active` and
 * records `student.lifecycle_changed` by the system. Separate file with schema-only imports
 * so the health module can call it without an import cycle. The pause-return reminder of
 * the mentor stays (it is the mentor's to-do).
 */
export async function resumeExpiredPauses(
  db: DbOrTx,
  today: string,
  now: Date = new Date(),
): Promise<string[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(students)
      .set({ lifecycleStatus: 'active', pausedUntil: null, statusReason: null, updatedAt: now })
      .where(and(eq(students.lifecycleStatus, 'paused'), lte(students.pausedUntil, today)))
      .returning({ id: students.userId });
    for (const row of rows) {
      await recordTimelineEvent(tx, {
        studentId: row.id,
        type: 'student.lifecycle_changed',
        actorId: null,
        data: { from: 'paused', to: 'active', automatic: true },
        occurredAt: now,
      });
    }
    return rows.map((r) => r.id);
  });
}
