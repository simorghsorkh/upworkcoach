import { and, count, countDistinct, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Actor } from '@/server/auth/current-user';
import { type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { studentHealth } from '../health/schema';
import { users } from '../identity/schema';
import { listMentorDirectory } from '../mentors/service';
import { enrollmentMentors, enrollments } from '../programs/schema';
import { averageProgressByRun, listRuns } from '../programs/service';
import { unansweredQuestionsFor } from '../questions/service';
import { students } from '../students/schema';
import { STUDENT_ACTIONABLE } from '../tasks/policy';
import { tasks } from '../tasks/schema';
import { reviewQueueFor } from '../tasks/service';
import type { DashboardCourseDTO, OrgDashboardDTO } from './contracts';

/**
 * The organization dashboard (Coach Office sprint 6). Reads only: counts come from one grouped
 * query per table; the lists reuse the services of «امروز» and the mentor directory.
 */
export async function getOrgDashboard(
  actor: Actor,
  db: DbOrTx = getDb(),
): Promise<OrgDashboardDTO> {
  if (actor.role !== 'admin') throw errors.forbidden();
  const org = actor.organizationId;
  const now = new Date();
  const [studentRows, seatRows, overdue, mentorRed, runs, directory, reviews, questions] =
    await Promise.all([
      db
        .select({
          lifecycle: students.lifecycleStatus,
          health: studentHealth.status,
          n: count(),
        })
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .leftJoin(studentHealth, eq(studentHealth.studentId, students.userId))
        .where(and(eq(students.organizationId, org), isNull(users.erasedAt)))
        .groupBy(students.lifecycleStatus, studentHealth.status),
      db
        .select({
          runId: enrollments.runId,
          status: enrollments.status,
          health: studentHealth.status,
          n: count(),
        })
        .from(enrollments)
        .innerJoin(users, eq(users.id, enrollments.studentId))
        .leftJoin(studentHealth, eq(studentHealth.studentId, enrollments.studentId))
        .where(
          and(
            eq(enrollments.organizationId, org),
            inArray(enrollments.status, ['active', 'paused']),
            isNull(users.erasedAt),
          ),
        )
        .groupBy(enrollments.runId, enrollments.status, studentHealth.status),
      db
        .select({ n: count() })
        .from(tasks)
        .innerJoin(students, eq(students.userId, tasks.studentId))
        .where(
          and(
            eq(tasks.organizationId, org),
            eq(students.lifecycleStatus, 'active'),
            inArray(tasks.status, [...STUDENT_ACTIONABLE]),
            lt(tasks.dueAt, now),
          ),
        ),
      db
        .select({ userId: enrollmentMentors.userId, n: countDistinct(enrollments.studentId) })
        .from(enrollmentMentors)
        .innerJoin(enrollments, eq(enrollments.id, enrollmentMentors.enrollmentId))
        .innerJoin(
          studentHealth,
          and(eq(studentHealth.studentId, enrollments.studentId), eq(studentHealth.status, 'red')),
        )
        .where(
          and(
            eq(enrollmentMentors.organizationId, org),
            isNull(enrollmentMentors.endedAt),
            eq(enrollments.status, 'active'),
          ),
        )
        .groupBy(enrollmentMentors.userId),
      listRuns(actor, {}, db),
      listMentorDirectory(actor, {}, db),
      reviewQueueFor(db, actor, {}, now),
      unansweredQuestionsFor(db, actor, undefined, now),
    ]);

  const sum = (rows: Array<{ n: number }>) => rows.reduce((a, r) => a + r.n, 0);
  const active = studentRows.filter((r) => r.lifecycle === 'active');
  const openRuns = runs.filter((r) => r.status === 'draft' || r.status === 'active');
  const progress = await averageProgressByRun(
    db,
    openRuns.filter((r) => !r.isLegacy).map((r) => r.id),
  );
  const seats = (runId: string, status: 'active' | 'paused') =>
    seatRows.filter((r) => r.runId === runId && r.status === status);
  const courses: DashboardCourseDTO[] = openRuns
    .map((r) => {
      const live = seats(r.id, 'active');
      return {
        id: r.id,
        title: r.title,
        isLegacy: r.isLegacy,
        mode: r.mode,
        status: r.status,
        active: sum(live),
        paused: sum(seats(r.id, 'paused')),
        averageProgress: progress.get(r.id) ?? null,
        red: sum(live.filter((x) => x.health === 'red')),
        yellow: sum(live.filter((x) => x.health === 'yellow')),
        staff: r.staff.map((s) => s.displayName),
      };
    })
    // The main path first, then the busiest courses.
    .sort((a, b) => Number(b.isLegacy) - Number(a.isLegacy) || b.active - a.active);
  const redOf = new Map(mentorRed.map((r) => [r.userId, r.n]));

  return {
    generatedAt: now.toISOString(),
    students: {
      active: sum(active),
      paused: sum(studentRows.filter((r) => r.lifecycle === 'paused')),
      red: sum(active.filter((r) => r.health === 'red')),
      yellow: sum(active.filter((r) => r.health === 'yellow')),
      green: sum(active.filter((r) => r.health === 'green')),
    },
    work: {
      reviews: reviews.length,
      breachedReviews: reviews.filter((r) => r.breached).length,
      unansweredQuestions: questions.length,
      breachedQuestions: questions.filter((q) => q.sla?.breached).length,
      overdueTasks: overdue[0]?.n ?? 0,
    },
    courses,
    mentors: directory.items
      .map((m) => ({
        id: m.id,
        displayName: m.displayName,
        role: m.role,
        students: m.counts.students,
        primary: m.counts.primary,
        capacity: m.profile.capacity,
        atCapacity: m.atCapacity,
        runs: m.counts.runs,
        overdueReviews: m.counts.overdueReviews,
        red: redOf.get(m.id) ?? 0,
      }))
      .sort((a, b) => b.red - a.red || b.students - a.students),
  };
}
