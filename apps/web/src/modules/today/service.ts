import { type BusinessHoursConfig, slaState } from '@/lib/business-hours';
import type { Actor } from '@/server/auth/current-user';
import { type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { scopeCondition, staffStudentScope } from '../access/scope';
import { getBusinessHours, getSlaSettings } from '../catalog/service';
import { getHealthFreshness, HEALTH_STALE_AFTER_MS } from '../health/recompute';
import { redWithoutActionRows } from '../health/service';
import { unansweredQuestionsFor } from '../questions/service';
import { remindersForToday } from '../reminders/service';
import { students } from '../students/schema';
import { listStudentItemsByHealth } from '../students/service';
import { reviewQueueFor } from '../tasks/service';
import type { HealthFreshnessDTO, TodayDTO, TodayQuery, WaitingOnUsItemDTO } from './contracts';

/**
 * today — «امروز» (PRD F6): reminders of today and before, reviews waiting (with the
 * business-hours SLA, decision E6), unanswered questions, stuck students and «منتظر ما».
 * Every section is limited to the actor's scope; an admin sees everybody, or one mentor
 * with `mentorId` (reminder owner, reviewer, question assignee, primary mentor).
 */

/** Urgency order of «منتظر ما»: breached first, then least time left. */
export function sortWaiting(items: WaitingOnUsItemDTO[]): WaitingOnUsItemDTO[] {
  return [...items].sort((a, b) =>
    a.breached !== b.breached ? (a.breached ? -1 : 1) : a.remainingHours - b.remainingHours,
  );
}

/** GET /today (A, M). */
export async function getToday(
  actor: Actor,
  query: TodayQuery = {},
  db: DbOrTx = getDb(),
): Promise<TodayDTO> {
  if (actor.role !== 'admin' && actor.role !== 'mentor') throw errors.forbidden();
  const now = new Date();
  const mentorId = actor.role === 'admin' ? query.mentorId : undefined;
  const [reminders, reviewQueue, unansweredQuestions, stuckStudents, redItems, freshness] =
    await Promise.all([
      remindersForToday(db, actor, mentorId, now),
      reviewQueueFor(db, actor, { reviewerId: mentorId }, now),
      unansweredQuestionsFor(db, actor, mentorId, now),
      listStudentItemsByHealth(db, actor, { health: ['red', 'yellow'], mentorId }, now),
      redWithoutAction(db, actor, mentorId, now),
      actor.role === 'admin'
        ? healthFreshnessFor(db, actor.organizationId, now)
        : Promise.resolve(undefined),
    ]);
  const waitingOnUs = sortWaiting([
    ...reviewQueue.map((r) => ({
      kind: 'review' as const,
      studentId: r.student.id,
      refId: r.taskId,
      since: r.lastSubmittedAt,
      slaHours: r.slaHours,
      elapsedHours: r.elapsedHours,
      remainingHours: r.slaRemainingHours,
      breached: r.breached,
      warning: r.warning,
    })),
    ...unansweredQuestions.flatMap((q) =>
      q.sla && q.awaitingTeamSince
        ? [
            {
              kind: 'question' as const,
              studentId: q.student.id,
              refId: q.id,
              since: q.awaitingTeamSince,
              slaHours: q.sla.slaHours,
              elapsedHours: q.sla.elapsedHours,
              remainingHours: q.sla.remainingHours,
              breached: q.sla.breached,
              warning: q.sla.warning,
            },
          ]
        : [],
    ),
    ...redItems,
  ]);
  return {
    generatedAt: now.toISOString(),
    ...(freshness ? { healthFreshness: freshness } : {}),
    reminders,
    reviewQueue,
    unansweredQuestions,
    stuckStudents,
    waitingOnUs,
    counts: {
      reminders: reminders.length,
      overdueReminders: reminders.filter((r) => r.overdue).length,
      reviews: reviewQueue.length,
      breachedReviews: reviewQueue.filter((r) => r.breached).length,
      unansweredQuestions: unansweredQuestions.length,
      stuckStudents: stuckStudents.length,
    },
  };
}

/** F-14: system-wide (not scoped: it says nothing about any one student). */
async function healthFreshnessFor(
  db: DbOrTx,
  organizationId: string,
  now: Date,
): Promise<HealthFreshnessDTO> {
  const f = await getHealthFreshness(db, now, organizationId);
  return {
    lastHealthSweepAt: f.lastHealthSweepAt?.toISOString() ?? null,
    oldestComputedAt: f.oldestComputedAt?.toISOString() ?? null,
    stale: f.stale,
    staleAfterHours: HEALTH_STALE_AFTER_MS / 3600_000,
  };
}

/**
 * «قرمز بدون اقدام» (data-model.md 4-3): red students with no staff note since `red_since`,
 * SLA `redNoActionHours` on the configured clock. Past `redEscalateDays` the item is
 * `escalated` and every admin sees it, even when filtering by one mentor.
 */
async function redWithoutAction(
  db: DbOrTx,
  actor: Actor,
  mentorId: string | undefined,
  now: Date,
): Promise<WaitingOnUsItemDTO[]> {
  const scope = await staffStudentScope(db, actor);
  const [rows, sla, hours] = await Promise.all([
    redWithoutActionRows(
      db,
      scopeCondition(scope, students.userId, students.organizationId),
      undefined,
    ),
    getSlaSettings(db, actor.organizationId),
    getBusinessHours(db, actor.organizationId),
  ]);
  const escalateMs = sla.redEscalateDays * 24 * 3600 * 1000;
  const out: WaitingOnUsItemDTO[] = [];
  for (const row of rows) {
    const escalated = now.getTime() - row.redSince.getTime() > escalateMs;
    if (mentorId && row.primaryMentorId !== mentorId && !(actor.role === 'admin' && escalated)) {
      continue;
    }
    const state = slaState(
      row.redSince,
      now,
      sla.redNoActionHours,
      sla.clock,
      hours as BusinessHoursConfig,
    );
    out.push({
      kind: 'red_no_action',
      studentId: row.studentId,
      refId: row.studentId,
      since: row.redSince.toISOString(),
      slaHours: sla.redNoActionHours,
      elapsedHours: state.elapsedHours,
      remainingHours: state.remainingHours,
      breached: state.breached,
      warning: state.warning,
      escalated,
    });
  }
  return out;
}
