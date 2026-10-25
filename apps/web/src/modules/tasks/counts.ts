import { and, asc, count, inArray, lt, notInArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { tasks } from './schema';

/**
 * Task counters for the student list, the record header and the summary panel
 * (api.md section 4: `openTaskCount`, `overdueTaskCount`, `nextTask`, `openTasks`).
 *
 * Schema-only imports, so students.service can use it without an import cycle
 * (tasks.service → students.service for profile snapshots).
 *   open    = status NOT IN (accepted, cancelled)   (data-model.md 2-5, «باز» of R-NOTASK)
 *   overdue = status IN (open, in_progress, changes_requested) AND due_at < now
 *   next    = the earliest deadline among the tasks the student still has to do
 */
export type TaskBrief = { id: string; title: string; dueAt: string; overdue: boolean };
export type TaskStats = { open: number; overdue: number; next: TaskBrief | null };

const ACTIONABLE = ['open', 'in_progress', 'changes_requested'] as const;
const FINAL = ['accepted', 'cancelled'] as const;

export async function taskStatsForStudents(
  db: DbOrTx,
  studentIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, TaskStats>> {
  const out = new Map<string, TaskStats>();
  if (studentIds.length === 0) return out;
  const ids = [...new Set(studentIds)];
  for (const id of ids) out.set(id, { open: 0, overdue: 0, next: null });

  const counts = await db
    .select({
      studentId: tasks.studentId,
      open: count(),
      overdue: sql<number>`count(*) FILTER (WHERE ${inArray(tasks.status, [...ACTIONABLE])} AND ${lt(tasks.dueAt, now)})::int`,
    })
    .from(tasks)
    .where(and(inArray(tasks.studentId, ids), notInArray(tasks.status, [...FINAL])))
    .groupBy(tasks.studentId);
  for (const row of counts) {
    const stats = out.get(row.studentId);
    if (stats) {
      stats.open = row.open;
      stats.overdue = row.overdue;
    }
  }

  const next = await db
    .selectDistinctOn([tasks.studentId], {
      studentId: tasks.studentId,
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
    })
    .from(tasks)
    .where(and(inArray(tasks.studentId, ids), inArray(tasks.status, [...ACTIONABLE])))
    .orderBy(tasks.studentId, asc(tasks.dueAt), asc(tasks.id));
  for (const row of next) {
    const stats = out.get(row.studentId);
    if (stats) {
      stats.next = {
        id: row.id,
        title: row.title,
        dueAt: row.dueAt.toISOString(),
        overdue: row.dueAt.getTime() < now.getTime(),
      };
    }
  }
  return out;
}

/** Open (not finished) tasks of one student, earliest deadline first (summary panel, F8). */
export async function openTasksOfStudent(
  db: DbOrTx,
  studentId: string,
  now: Date = new Date(),
): Promise<TaskBrief[]> {
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, status: tasks.status })
    .from(tasks)
    .where(and(inArray(tasks.studentId, [studentId]), notInArray(tasks.status, [...FINAL])))
    .orderBy(asc(tasks.dueAt), asc(tasks.id))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dueAt: r.dueAt.toISOString(),
    overdue:
      (ACTIONABLE as readonly string[]).includes(r.status) && r.dueAt.getTime() < now.getTime(),
  }));
}
