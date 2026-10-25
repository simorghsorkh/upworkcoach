import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { students } from './schema';

/**
 * `students.last_activity_at` (data-model.md 2-3, base of R-INACT): written at most once an
 * hour per student so that the per-request session touch stays cheap.
 * Separate file (schema-only imports) so identity can call it without an import cycle.
 * Returns true when the value changed (the caller then recomputes health).
 */
const HOUR_MS = 3600 * 1000;

export async function touchStudentActivity(
  db: DbOrTx,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(students)
    .set({ lastActivityAt: now })
    .where(
      and(
        eq(students.userId, userId),
        or(
          isNull(students.lastActivityAt),
          lt(students.lastActivityAt, new Date(now.getTime() - HOUR_MS)),
        ),
      ),
    )
    .returning({ id: students.userId });
  return rows.length > 0;
}
