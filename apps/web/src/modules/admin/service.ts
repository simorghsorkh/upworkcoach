import { and, isNotNull, lt, ne, sql } from 'drizzle-orm';
import { maskPhone } from '@/lib/phone';
import type { DbOrTx } from '@/server/db';
import { auditLog } from './schema';

/**
 * admin — audit log (data-model.md 2-1, ADR-0004 section 5, security.md SEC-L7).
 * Other modules write audit rows only through `recordAudit`, inside their own transaction.
 */
export type AuditAction =
  | 'user.invited'
  | 'user.invite_link_created'
  | 'user.reset_link_created'
  | 'user.invite_accepted'
  | 'user.password_reset'
  | 'user.bootstrap_admin'
  | 'user.erased'
  | 'auth.token_revoked_mismatch'
  | 'auth.locked'
  | 'session.revoked_all'
  | 'session.reauth'
  | 'session.organization_switched'
  | 'organization.created'
  | 'organization.renamed'
  | 'organization.member_added'
  | 'user.updated'
  | 'user.phone_changed'
  | 'user.disabled'
  | 'user.enabled'
  | 'user.role_changed'
  | 'student.mentor_changed'
  | 'catalog.stage_created'
  | 'catalog.stage_updated'
  | 'catalog.stages_reordered'
  | 'catalog.stage_deactivated'
  | 'catalog.platform_created'
  | 'catalog.platform_updated'
  | 'catalog.task_template_created'
  | 'catalog.task_template_updated'
  | 'catalog.milestone_type_created'
  | 'catalog.milestone_type_updated'
  | 'catalog.canned_response_created'
  | 'catalog.canned_response_updated'
  | 'settings.updated'
  | 'question.assignee_changed'
  | 'health.recomputed'
  | 'export.milestones'
  | 'note.visibility_changed'
  | 'import.students'
  | 'export.students'
  | 'export.tasks'
  | 'program.template_created'
  | 'program.template_published'
  | 'program.template_archived'
  | 'program.template_restored'
  | 'program.template_deleted'
  | 'program.template_submitted'
  | 'program.template_approved'
  | 'program.template_rejected'
  | 'program.run_created'
  | 'program.run_status_changed'
  | 'program.staff_added'
  | 'program.staff_ended'
  | 'program.enrolled'
  | 'program.activity_assigned'
  | 'program.mentor_assigned'
  | 'program.mentor_ended'
  | 'mentor.profile_updated'
  | 'mentor.students_transferred';

export type AuditEntry = {
  actorId: string | null;
  /** The organization the event happened in; null for account-level and CLI events. */
  organizationId?: string | null;
  action: AuditAction;
  targetType?:
    | 'organization'
    | 'user'
    | 'session'
    | 'auth_token'
    | 'student'
    | 'stage'
    | 'platform'
    | 'task_template'
    | 'note'
    | 'settings'
    | 'milestone_type'
    | 'canned_response'
    | 'question'
    | 'program_template'
    | 'program_run'
    | 'enrollment'
    | 'mentor';
  targetId?: string;
  data?: Record<string, unknown>;
  ip?: string | null;
};

// Never store secrets or links in audit data (SEC-T8, SEC-L7).
const FORBIDDEN_KEY = /token|password|secret|url|link|cookie|hash/i;

export function assertSafeAuditData(data: Record<string, unknown>): void {
  for (const key of Object.keys(data)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`audit data must not contain "${key}"`);
  }
}

export async function recordAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  const data = entry.data ?? {};
  assertSafeAuditData(data);
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    organizationId: entry.organizationId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    data,
    ip: entry.ip ?? null,
  });
}

/**
 * Erasure support (ADR-0010): masks any E.164 phone inside `data` of rows that mention the
 * user, and clears the IP of rows the user performed. Rows themselves stay.
 */
export async function anonymizeAuditForUser(
  db: DbOrTx,
  userId: string,
  phone: string,
): Promise<void> {
  if (/^\+\d{10,15}$/.test(phone)) {
    await db.execute(sql`
      UPDATE ${auditLog}
      SET data = replace(data::text, ${phone}, ${maskPhone(phone)})::jsonb
      WHERE data::text LIKE ${`%${phone}%`}
    `);
  }
  await db.update(auditLog).set({ ip: null }).where(sql`${auditLog.actorId} = ${userId}`);
}

/**
 * Retention (data-model.md 6-1): IP cleared after 90 days; rows deleted after 24 months,
 * except `user.erased` (the erasure list replayed after a backup restore).
 */
export async function applyAuditRetention(db: DbOrTx, now: Date = new Date()): Promise<void> {
  const ipCutoff = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  const rowCutoff = new Date(now);
  rowCutoff.setUTCMonth(rowCutoff.getUTCMonth() - 24);
  await db
    .update(auditLog)
    .set({ ip: null })
    .where(and(lt(auditLog.createdAt, ipCutoff), isNotNull(auditLog.ip)));
  await db
    .delete(auditLog)
    .where(and(lt(auditLog.createdAt, rowCutoff), ne(auditLog.action, 'user.erased')));
}
