import { and, asc, count, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { milestones } from '../milestones/schema';
import { questionMessages } from '../questions/schema';
import { submissions } from '../tasks/schema';
import { attachments } from './schema';

/** files — queries (only used inside the module). Columns are explicit (SEC-A9). */

const columns = {
  id: attachments.id,
  organizationId: attachments.organizationId,
  storageKey: attachments.storageKey,
  originalName: attachments.originalName,
  mimeType: attachments.mimeType,
  sizeBytes: attachments.sizeBytes,
  width: attachments.width,
  height: attachments.height,
  uploadedBy: attachments.uploadedBy,
  status: attachments.status,
  submissionId: attachments.submissionId,
  questionMessageId: attachments.questionMessageId,
  milestoneId: attachments.milestoneId,
  createdAt: attachments.createdAt,
};

/** The one parent a linked attachment has (CHECK: exactly one). */
export type AttachmentParent =
  | { submissionId: string }
  | { questionMessageId: string }
  | { milestoneId: string };

export type AttachmentRow = NonNullable<Awaited<ReturnType<typeof findAttachment>>>;

export async function findAttachment(db: DbOrTx, id: string) {
  const [row] = await db.select(columns).from(attachments).where(eq(attachments.id, id));
  return row ?? null;
}

/** SEC-U7 quota inputs: pending count and uploads in the last 24 hours. */
export async function uploadCounts(
  db: DbOrTx,
  userId: string,
  since: Date,
): Promise<{ pending: number; recent: number }> {
  const [pending] = await db
    .select({ n: count() })
    .from(attachments)
    .where(and(eq(attachments.uploadedBy, userId), eq(attachments.status, 'pending')));
  const [recent] = await db
    .select({ n: count() })
    .from(attachments)
    .where(and(eq(attachments.uploadedBy, userId), gt(attachments.createdAt, since)));
  return { pending: pending?.n ?? 0, recent: recent?.n ?? 0 };
}

export async function insertAttachment(
  db: DbOrTx,
  values: {
    /** The uploader's (active) organization; a file links only to a parent there. */
    organizationId: string;
    storageKey: string;
    originalName: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    sizeBytes: number;
    width: number;
    height: number;
    uploadedBy: string;
  },
) {
  const [row] = await db
    .insert(attachments)
    .values({ ...values, status: 'pending', createdAt: new Date() })
    .returning(columns);
  if (!row) throw new Error('insertAttachment returned no row');
  return row;
}

/**
 * C4: the ONLY way an attachment gets a parent — one atomic UPDATE, inside the parent's
 * transaction, restricted to the actor's own pending rows. Returns the linked ids.
 */
export async function linkToParent(
  db: DbOrTx,
  ids: readonly string[],
  uploadedBy: string,
  parent: AttachmentParent,
): Promise<string[]> {
  const rows = await db
    .update(attachments)
    .set({ status: 'linked', ...parent })
    .where(
      and(
        inArray(attachments.id, [...ids]),
        eq(attachments.status, 'pending'),
        eq(attachments.uploadedBy, uploadedBy),
        // ADR-0011: a file uploaded in one organization never links to another's record.
        eq(attachments.organizationId, parentOrganization(parent)),
      ),
    )
    .returning({ id: attachments.id });
  return rows.map((r) => r.id);
}

function parentOrganization(parent: AttachmentParent) {
  if ('submissionId' in parent) {
    return sql`(SELECT ${submissions.organizationId} FROM ${submissions} WHERE ${submissions.id} = ${parent.submissionId})`;
  }
  if ('questionMessageId' in parent) {
    return sql`(SELECT ${questionMessages.organizationId} FROM ${questionMessages} WHERE ${questionMessages.id} = ${parent.questionMessageId})`;
  }
  return sql`(SELECT ${milestones.organizationId} FROM ${milestones} WHERE ${milestones.id} = ${parent.milestoneId})`;
}

/** Linked attachments of question messages or milestones. */
export async function listForParents(
  db: DbOrTx,
  column: 'questionMessageId' | 'milestoneId',
  ids: readonly string[],
) {
  if (ids.length === 0) return [];
  return db
    .select(columns)
    .from(attachments)
    .where(and(inArray(attachments[column], [...ids]), eq(attachments.status, 'linked')))
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
}

export async function listForSubmissions(db: DbOrTx, submissionIds: readonly string[]) {
  if (submissionIds.length === 0) return [];
  return db
    .select(columns)
    .from(attachments)
    .where(
      and(inArray(attachments.submissionId, [...submissionIds]), eq(attachments.status, 'linked')),
    )
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
}

/** `files.cleanup`: pending rows older than the cutoff (batch). */
export async function listStalePending(db: DbOrTx, olderThan: Date, limit: number) {
  return db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(and(eq(attachments.status, 'pending'), lt(attachments.createdAt, olderThan)))
    .orderBy(asc(attachments.createdAt))
    .limit(limit);
}

export async function listByIds(db: DbOrTx, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(inArray(attachments.id, [...ids]));
}

export async function deleteAttachment(db: DbOrTx, id: string): Promise<void> {
  await db.delete(attachments).where(eq(attachments.id, id));
}

/**
 * Erasure (ADR-0010): every attachment of the student's submissions, question messages and
 * milestones, and every pending upload of theirs becomes an anonymous, ancient pending row (display name removed), so a
 * failed storage delete after commit is retried by `files.cleanup`.
 */
export async function detachForErasure(
  db: DbOrTx,
  userId: string,
  parents: {
    submissionIds: readonly string[];
    questionMessageIds?: readonly string[];
    milestoneIds?: readonly string[];
  },
): Promise<string[]> {
  const parts = [sql`${attachments.uploadedBy} = ${userId}`];
  if (parents.submissionIds.length > 0) {
    parts.push(sql`${inArray(attachments.submissionId, [...parents.submissionIds])}`);
  }
  if (parents.questionMessageIds && parents.questionMessageIds.length > 0) {
    parts.push(sql`${inArray(attachments.questionMessageId, [...parents.questionMessageIds])}`);
  }
  if (parents.milestoneIds && parents.milestoneIds.length > 0) {
    parts.push(sql`${inArray(attachments.milestoneId, [...parents.milestoneIds])}`);
  }
  const parentCondition = sql`(${sql.join(parts, sql` OR `)})`;
  const rows = await db
    .update(attachments)
    .set({
      status: 'pending',
      submissionId: null,
      questionMessageId: null,
      milestoneId: null,
      originalName: 'image',
      createdAt: new Date(0),
    })
    .where(parentCondition)
    .returning({ id: attachments.id });
  return rows.map((r) => r.id);
}
