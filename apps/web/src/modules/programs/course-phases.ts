import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { daysSince, overExpected } from '../students/policy';
import type { CoursePhaseDTO } from './contracts';
import { enrollments, programRuns, runNodes } from './schema';

/**
 * Where a mentee stands in each of their courses (Coach Office sprint 5c): the current phase of
 * every enrollment that holds a seat in an open run other than the main path. The main path
 * keeps its 0.1 stage column; these are shown next to it on the student list, "Today" and the
 * board. Read-only; callers have already scoped the students.
 */
export async function coursePhasesOf(
  db: DbOrTx,
  organizationId: string,
  studentIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, CoursePhaseDTO[]>> {
  const out = new Map<string, CoursePhaseDTO[]>();
  const ids = [...new Set(studentIds)];
  if (!ids.length) return out;
  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      studentId: enrollments.studentId,
      status: enrollments.status,
      runId: programRuns.id,
      runTitle: programRuns.title,
      phaseId: enrollments.currentPhaseNodeId,
      phaseEnteredAt: enrollments.phaseEnteredAt,
      enrolledAt: enrollments.enrolledAt,
    })
    .from(enrollments)
    .innerJoin(programRuns, eq(programRuns.id, enrollments.runId))
    .where(
      and(
        eq(enrollments.organizationId, organizationId),
        inArray(enrollments.studentId, ids),
        inArray(enrollments.status, ['active', 'paused']),
        inArray(programRuns.status, ['draft', 'active']),
        isNull(programRuns.legacyPathId),
      ),
    )
    .orderBy(asc(programRuns.title), asc(enrollments.id));
  if (!rows.length) return out;
  const phases = await runPhases(db, [...new Set(rows.map((r) => r.runId))]);
  for (const r of rows) {
    const list = phases.get(r.runId) ?? [];
    const index = list.findIndex((p) => p.id === r.phaseId);
    const phase = index >= 0 ? list[index] : undefined;
    const days = daysSince(r.phaseEnteredAt ?? r.enrolledAt, now);
    const item: CoursePhaseDTO = {
      enrollmentId: r.enrollmentId,
      run: { id: r.runId, title: r.runTitle },
      status: r.status === 'paused' ? 'paused' : 'active',
      phase: phase ? { id: phase.id, title: phase.title, position: index + 1 } : null,
      phaseCount: list.length,
      daysInPhase: phase ? days : null,
      overExpected: phase && r.status === 'active' ? overExpected(days, phase) : 'none',
    };
    const forStudent = out.get(r.studentId) ?? [];
    forStudent.push(item);
    out.set(r.studentId, forStudent);
  }
  return out;
}

export type RunPhase = {
  id: string;
  title: string;
  expectedDays: number | null;
  isOpenEnded: boolean;
  isGate: boolean;
};

/** The phases of some runs, in order. */
export async function runPhases(
  db: DbOrTx,
  runIds: readonly string[],
): Promise<Map<string, RunPhase[]>> {
  const out = new Map<string, RunPhase[]>();
  if (!runIds.length) return out;
  const rows = await db
    .select({
      runId: runNodes.runId,
      id: runNodes.id,
      title: runNodes.title,
      expectedDays: runNodes.expectedDays,
      isOpenEnded: runNodes.isOpenEnded,
      isGate: runNodes.isGate,
    })
    .from(runNodes)
    .where(and(inArray(runNodes.runId, [...runIds]), eq(runNodes.nodeType, 'phase')))
    .orderBy(asc(runNodes.sortOrder), asc(runNodes.id));
  for (const { runId, ...phase } of rows) {
    const list = out.get(runId) ?? [];
    list.push(phase);
    out.set(runId, list);
  }
  return out;
}
