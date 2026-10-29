import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { users } from '../identity/schema';
import { enrollmentMentors, enrollments, programRuns, runStaff } from '../programs/schema';
import { mentorProfiles } from './schema';

/**
 * mentors — queries. Read-only over `enrollment_mentors`, `run_staff` and `enrollments`
 * (programs module); writes only `mentor_profiles`.
 */

const LIVE = sql.raw(`('active', 'paused')`);

export async function listProfiles(db: DbOrTx, org: string) {
  return db
    .select({
      userId: mentorProfiles.userId,
      specialties: mentorProfiles.specialties,
      bio: mentorProfiles.bio,
      capacity: mentorProfiles.capacity,
      acceptingStudents: mentorProfiles.acceptingStudents,
    })
    .from(mentorProfiles)
    .where(eq(mentorProfiles.organizationId, org));
}

export type ProfileRow = Awaited<ReturnType<typeof listProfiles>>[number];

export async function upsertProfile(
  db: DbOrTx,
  org: string,
  userId: string,
  values: Partial<Omit<ProfileRow, 'userId'>>,
  updatedBy: string,
  now: Date,
): Promise<void> {
  await db
    .insert(mentorProfiles)
    .values({ organizationId: org, userId, ...values, updatedBy, updatedAt: now })
    .onConflictDoUpdate({
      target: [mentorProfiles.organizationId, mentorProfiles.userId],
      set: { ...values, updatedBy, updatedAt: now },
    });
}

/** Workload per staff member of one organization (live enrollments only). */
export async function workload(db: DbOrTx, org: string) {
  const result = await db.execute<{
    userId: string;
    students: number;
    primary: number;
    secondary: number;
    runs: number;
  }>(sql`
    WITH links AS (
      SELECT em.user_id, e.student_id, em.role
        FROM enrollment_mentors em
        JOIN enrollments e ON e.id = em.enrollment_id
       WHERE em.organization_id = ${org} AND em.ended_at IS NULL AND e.status IN ${LIVE}
      UNION ALL
      SELECT rs.user_id, e.student_id, 'staff'
        FROM run_staff rs
        JOIN enrollments e ON e.run_id = rs.run_id
       WHERE rs.organization_id = ${org} AND rs.ended_at IS NULL AND e.status IN ${LIVE}
    ),
    per_user AS (
      SELECT user_id,
             count(DISTINCT student_id)::int AS students,
             count(DISTINCT student_id) FILTER (WHERE role = 'primary')::int AS "primary",
             count(DISTINCT student_id) FILTER (WHERE role = 'secondary')::int AS secondary
        FROM links GROUP BY user_id
    ),
    runs AS (
      SELECT rs.user_id, count(DISTINCT rs.run_id)::int AS runs
        FROM run_staff rs JOIN program_runs r ON r.id = rs.run_id
       WHERE rs.organization_id = ${org} AND rs.ended_at IS NULL AND r.status <> 'archived'
       GROUP BY rs.user_id
    )
    SELECT coalesce(p.user_id, r.user_id) AS "userId",
           coalesce(p.students, 0) AS students,
           coalesce(p."primary", 0) AS "primary",
           coalesce(p.secondary, 0) AS secondary,
           coalesce(r.runs, 0) AS runs
      FROM per_user p FULL JOIN runs r ON r.user_id = p.user_id
  `);
  return result.rows;
}

/** A staff member's active mentor rows with the student and run. */
export async function studentsOf(db: DbOrTx, org: string, userId: string) {
  return db
    .select({
      enrollmentId: enrollments.id,
      studentId: enrollments.studentId,
      studentName: users.displayName,
      runId: programRuns.id,
      runTitle: programRuns.title,
      legacyPathId: programRuns.legacyPathId,
      role: enrollmentMentors.role,
      enrollmentStatus: enrollments.status,
      since: enrollmentMentors.startedAt,
    })
    .from(enrollmentMentors)
    .innerJoin(enrollments, eq(enrollments.id, enrollmentMentors.enrollmentId))
    .innerJoin(programRuns, eq(programRuns.id, enrollments.runId))
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(
      and(
        eq(enrollmentMentors.organizationId, org),
        eq(enrollmentMentors.userId, userId),
        isNull(enrollmentMentors.endedAt),
      ),
    )
    .orderBy(
      sql`${enrollments.status} NOT IN ${LIVE}`,
      sql`${enrollmentMentors.role} = 'secondary'`,
      asc(users.displayName),
    );
}

/** Runs a staff member is on (not archived), with their live enrollment count. */
export async function runsOf(db: DbOrTx, org: string, userId: string) {
  return db
    .select({
      id: programRuns.id,
      title: programRuns.title,
      role: runStaff.role,
      activeCount: sql<number>`(SELECT count(*)::int FROM enrollments e WHERE e.run_id = ${programRuns.id} AND e.status IN ${LIVE})`,
    })
    .from(runStaff)
    .innerJoin(programRuns, eq(programRuns.id, runStaff.runId))
    .where(
      and(
        eq(runStaff.organizationId, org),
        eq(runStaff.userId, userId),
        isNull(runStaff.endedAt),
        sql`${programRuns.status} <> 'archived'`,
      ),
    )
    .orderBy(asc(programRuns.title));
}
