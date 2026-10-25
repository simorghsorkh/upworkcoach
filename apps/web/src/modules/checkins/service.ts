import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { tehranDayStart } from '@/lib/tehran-day';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { decodeCursor, encodeCursor } from '@/server/http/schemas';
import { loadInScope } from '../access/scope';
import { getCheckinSettings } from '../catalog/service';
import { recomputeHealthSafe } from '../health/recompute';
import { checkinWindowOpens, currentWeekStart } from '../health/rules';
import { createThreadForStudent } from '../questions/service';
import { touchStudentActivity } from '../students/activity';
import { submissions, tasks } from '../tasks/schema';
import { recordTimelineEvent } from '../timeline/events';
import type {
  CheckinDTO,
  CheckinListDTO,
  CreateCheckinInput,
  CurrentCheckinDTO,
  ListCheckinsQuery,
} from './contracts';
import { checkins } from './schema';

/**
 * checkins — weekly check-in (api.md section 11, decision E5 = on). With
 * `settings.checkin.enabled = false` every function answers 404 (api.md). A check-in feeds
 * R-CHECKIN / R-MOOD and student activity (R-INACT); «needs help» opens a question with
 * `source = 'checkin'` in the same transaction.
 *
 * Assumption: sending is allowed on any day; it always belongs to the current Tehran week
 * («ارسال دیرتر به هفته‌ی بعد تعلق می‌گیرد»). `open` only tells the UI when to prompt.
 */

const DEFAULT_LIMIT = 20;

async function assertEnabled(
  db: DbOrTx,
): Promise<{ weekday: Parameters<typeof checkinWindowOpens>[1] }> {
  const settings = await getCheckinSettings(db);
  if (!settings.enabled) throw errors.notFound();
  return { weekday: settings.weekday };
}

const columns = {
  id: checkins.id,
  weekStart: checkins.weekStart,
  activityText: checkins.activityText,
  blocker: checkins.blocker,
  mood: checkins.mood,
  nextWeekPlan: checkins.nextWeekPlan,
  needsHelp: checkins.needsHelp,
  questionId: checkins.questionId,
  submittedAt: checkins.submittedAt,
};

type Row = NonNullable<Awaited<ReturnType<typeof findWeek>>>;

function toDTO(row: Row): CheckinDTO {
  return {
    id: row.id,
    weekStart: row.weekStart,
    activityText: row.activityText,
    blocker: row.blocker,
    mood: row.mood,
    nextWeekPlan: row.nextWeekPlan,
    needsHelp: row.needsHelp,
    questionId: row.questionId,
    submittedAt: row.submittedAt.toISOString(),
  };
}

async function findWeek(db: DbOrTx, studentId: string, weekStart: string) {
  const [row] = await db
    .select(columns)
    .from(checkins)
    .where(and(eq(checkins.studentId, studentId), eq(checkins.weekStart, weekStart)));
  return row ?? null;
}

/** GET /me/checkins/current (S). */
export async function getCurrentCheckin(
  actor: Actor,
  db: DbOrTx = getDb(),
): Promise<CurrentCheckinDTO> {
  if (actor.role !== 'student') throw errors.forbidden();
  const { weekday } = await assertEnabled(db);
  const now = new Date();
  const weekStart = currentWeekStart(now);
  const opensAt = checkinWindowOpens(weekStart, weekday);
  const since = tehranDayStart(weekStart);
  const [existing, [submitted], [accepted]] = await Promise.all([
    findWeek(db, actor.userId, weekStart),
    db
      .select({ n: sql<number>`count(DISTINCT ${submissions.taskId})::int` })
      .from(submissions)
      .innerJoin(tasks, eq(tasks.id, submissions.taskId))
      .where(and(eq(tasks.studentId, actor.userId), gte(submissions.createdAt, since))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.studentId, actor.userId),
          eq(tasks.status, 'accepted'),
          gte(tasks.closedAt, since),
        ),
      ),
  ]);
  return {
    weekStart,
    open: now.getTime() >= opensAt.getTime(),
    opensAt: opensAt.toISOString(),
    existing: existing ? toDTO(existing) : null,
    weekSummary: { tasksSubmitted: submitted?.n ?? 0, tasksAccepted: accepted?.n ?? 0 },
  };
}

/** POST /me/checkins (S) → 201. A second one in the same week → 409. */
export async function submitCheckin(
  actor: Actor,
  input: CreateCheckinInput,
  db: Db = getDb(),
): Promise<CheckinDTO> {
  if (actor.role !== 'student') throw errors.forbidden();
  await assertEnabled(db);
  const now = new Date();
  const weekStart = currentWeekStart(now);
  const row = await db.transaction(async (tx) => {
    // Serialise two submissions of the same week (unique index is the last line of defence).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`checkin:${actor.userId}`}))`);
    if (await findWeek(tx, actor.userId, weekStart)) {
      throw errors.conflict('check-in این هفته را قبلاً فرستاده‌ای.');
    }
    let questionId: string | null = null;
    if (input.needsHelp) {
      questionId = await createThreadForStudent(
        tx,
        actor,
        actor.userId,
        {
          subject: 'درخواست کمک در check-in هفتگی',
          body:
            input.blocker ??
            input.activityText ??
            'در check-in این هفته گفتم به کمک مشاور نیاز دارم.',
          source: 'checkin',
        },
        now,
      );
    }
    const [created] = await tx
      .insert(checkins)
      .values({
        studentId: actor.userId,
        weekStart,
        activityText: input.activityText ?? null,
        blocker: input.blocker ?? null,
        mood: input.mood,
        nextWeekPlan: input.nextWeekPlan ?? null,
        needsHelp: input.needsHelp,
        questionId,
        submittedAt: now,
      })
      .returning(columns);
    if (!created) throw new Error('submitCheckin returned no row');
    await recordTimelineEvent(tx, {
      studentId: actor.userId,
      type: 'checkin.submitted',
      actorId: actor.userId,
      data: { weekStart, mood: input.mood, needsHelp: input.needsHelp },
      occurredAt: now,
    });
    await touchStudentActivity(tx, actor.userId, now);
    return created;
  });
  await recomputeHealthSafe(actor.userId, db);
  return toDTO(row);
}

/** GET /students/:id/checkins (A, M in scope): newest week first, cursor. */
export async function listStudentCheckins(
  actor: Actor,
  studentId: string,
  query: ListCheckinsQuery = {},
  db: DbOrTx = getDb(),
): Promise<CheckinListDTO> {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
  await assertEnabled(db);
  await loadInScope(db, actor, 'student', studentId);
  const offset = decodeCursor(query.cursor);
  if (offset < 0) throw errors.validation({ cursor: 'مقدار نامعتبر است' });
  const limit = query.limit ?? DEFAULT_LIMIT;
  const rows = await db
    .select(columns)
    .from(checkins)
    .where(eq(checkins.studentId, studentId))
    .orderBy(desc(checkins.weekStart))
    .limit(limit + 1)
    .offset(offset);
  return {
    items: rows.slice(0, limit).map(toDTO),
    nextCursor: rows.length > limit ? encodeCursor(offset + limit) : null,
  };
}
