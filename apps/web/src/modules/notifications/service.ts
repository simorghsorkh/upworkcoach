import { and, count, desc, eq, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type DbOrTx, getDb } from '@/server/db';
import { users } from '../identity/schema';
import type {
  ListNotificationsQuery,
  MarkNotificationsReadInput,
  NotificationDTO,
  NotificationListDTO,
} from './contracts';
import { type NotificationData, type NotificationKind, notifications } from './schema';

/**
 * In-app notifications (Coach Office sprint 6b). `notify` is the only writer and is called by
 * the other modules inside their own transaction; everything else reads or marks the caller's
 * own rows in the active organization.
 */

export type NewNotification = {
  userId: string | null | undefined;
  kind: NotificationKind;
  studentId?: string | null;
  subjectId?: string | null;
  data?: NotificationData;
};

/**
 * Internal: one row per recipient. The actor never notifies themself, a missing recipient is
 * skipped and the same recipient gets one row per call.
 */
export async function notify(
  db: DbOrTx,
  actor: Pick<Actor, 'userId' | 'organizationId'>,
  items: readonly NewNotification[],
  now = new Date(),
): Promise<void> {
  const seen = new Set<string>();
  const rows = items.flatMap((n) => {
    if (!n.userId || n.userId === actor.userId) return [];
    const key = `${n.userId}|${n.kind}|${n.subjectId ?? ''}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        organizationId: actor.organizationId,
        userId: n.userId,
        kind: n.kind,
        actorId: actor.userId,
        studentId: n.studentId ?? null,
        subjectId: n.subjectId ?? null,
        data: n.data ?? {},
        createdAt: now,
      },
    ];
  });
  if (rows.length) await db.insert(notifications).values(rows);
}

const own = (actor: Actor): SQL =>
  and(
    eq(notifications.userId, actor.userId),
    eq(notifications.organizationId, actor.organizationId),
  ) as SQL;

const isStudent = (actor: Actor) => actor.role === 'student';

function hrefOf(actor: Actor, kind: NotificationKind, subjectId: string | null): string {
  const id = subjectId ?? '';
  if (isStudent(actor)) {
    if (kind === 'task_assigned' || kind === 'task_reviewed') return `/my/tasks/${id}`;
    if (kind === 'question_reply') return `/my/questions/${id}`;
    if (kind === 'session_scheduled' || kind === 'booking_decided') return '/my/programs';
    return '/home';
  }
  if (kind === 'booking_requested' || kind === 'booking_cancelled') return '/calendar';
  if (kind === 'task_submitted') return `/tasks/${id}`;
  if (kind === 'question_new') return `/questions/${id}`;
  return '/today';
}

/** GET /notifications — newest first, 20 a page. */
export async function listNotifications(
  actor: Actor,
  query: ListNotificationsQuery = {},
  db: DbOrTx = getDb(),
): Promise<NotificationListDTO> {
  const limit = query.limit ?? 20;
  const conditions: SQL[] = [own(actor)];
  const [at, id] = (query.cursor ?? '').split('|');
  const atDate = at ? new Date(at) : null;
  if (atDate && !Number.isNaN(atDate.getTime()) && id && isUuid(id)) {
    conditions.push(
      or(
        lt(notifications.createdAt, atDate),
        and(eq(notifications.createdAt, atDate), lt(notifications.id, id)),
      ) as SQL,
    );
  }
  const student = alias(users, 'notification_student');
  const by = alias(users, 'notification_actor');
  const [rows, unread] = await Promise.all([
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        subjectId: notifications.subjectId,
        data: notifications.data,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        studentId: notifications.studentId,
        studentName: student.displayName,
        actorName: by.displayName,
      })
      .from(notifications)
      .leftJoin(student, eq(student.id, notifications.studentId))
      .leftJoin(by, eq(by.id, notifications.actorId))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1),
    unreadNotificationCount(actor, db),
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(
      (r): NotificationDTO => ({
        id: r.id,
        kind: r.kind,
        href: hrefOf(actor, r.kind, r.subjectId),
        data: r.data,
        student:
          r.studentId && r.studentName && !isStudent(actor)
            ? { id: r.studentId, displayName: r.studentName }
            : null,
        actor: r.actorName ? { displayName: r.actorName } : null,
        read: r.readAt !== null,
        createdAt: r.createdAt.toISOString(),
      }),
    ),
    unread,
    nextCursor: rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

/** The badge of the bell (layouts); never throws into a page. */
export async function unreadNotificationCount(actor: Actor, db: DbOrTx = getDb()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(own(actor), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** POST /notifications/read — the given ids (others' ids are ignored) or all unread. */
export async function markNotificationsRead(
  actor: Actor,
  input: MarkNotificationsReadInput,
  db: DbOrTx = getDb(),
): Promise<{ unread: number }> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        own(actor),
        isNull(notifications.readAt),
        input.ids ? inArray(notifications.id, input.ids) : undefined,
      ),
    );
  return { unread: await unreadNotificationCount(actor, db) };
}

/** Account erasure (ADR-0010): notices to the person and notices about the mentee go. */
export async function eraseNotificationsOf(db: DbOrTx, userId: string): Promise<void> {
  await db
    .delete(notifications)
    .where(or(eq(notifications.userId, userId), eq(notifications.studentId, userId)));
}
