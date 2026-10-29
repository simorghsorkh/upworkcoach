import { randomUUID } from 'node:crypto';
import { isUuid } from '@/lib/uuid';
import type { Actor } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { ApiError, errors } from '@/server/http/errors';
import { logger, safeError } from '@/server/logger';
import { type FileStorage, getStorage } from '@/server/storage';
import { findAttachmentRoot } from '../access/repo';
import { loadInScope } from '../access/scope';
import type { AttachmentDTO, AttachmentUploadedDTO } from './contracts';
import { processImage, sanitizeFileName } from './image';
import * as repo from './repo';

/**
 * files — image attachments (api.md section 14, data-model.md 2-5, security.md C4).
 *
 * Upload → `pending` (only the uploader can see it) → linked to exactly one parent by an
 * atomic UPDATE inside the parent's transaction (`linkAttachmentsToSubmission`). Access to a
 * linked file = access to its parent (ADR-0004). Files are always streamed by our server.
 */

export const MAX_PENDING_PER_USER = 20;
export const MAX_UPLOADS_PER_DAY = 100;
export const MAX_ATTACHMENTS_PER_REQUEST = 10;
const DAY_MS = 24 * 3600 * 1000;

const QUOTA_MESSAGE =
  'تعداد تصویرهای بارگذاری‌شده از سقف گذشته است؛ اول تصویرهای قبلی را بفرست یا فردا دوباره امتحان کن.';

export function hrefOf(id: string): string {
  return `/api/v1/attachments/${id}`;
}

export function toAttachmentDTO(row: {
  id: string;
  mimeType: AttachmentDTO['mimeType'];
  sizeBytes: number;
  width: number;
  height: number;
  originalName: string;
}): AttachmentDTO {
  return {
    id: row.id,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    originalName: row.originalName,
    href: hrefOf(row.id),
  };
}

/**
 * POST /attachments (any signed-in user). The route already enforced the byte cap before
 * buffering (SEC-U4). Quota (SEC-U7) → content check + re-encode (SEC-U1/U2/U5) → store
 * under a random key (SEC-U8) → `pending` row.
 */
export async function uploadAttachment(
  actor: Actor,
  file: { bytes: Uint8Array; name: string | null },
  db: Db = getDb(),
  storage: FileStorage = getStorage(),
): Promise<AttachmentUploadedDTO> {
  const counts = await repo.uploadCounts(db, actor.userId, new Date(Date.now() - DAY_MS));
  if (counts.pending >= MAX_PENDING_PER_USER || counts.recent >= MAX_UPLOADS_PER_DAY) {
    throw new ApiError('TOO_MANY_ATTEMPTS', { message: QUOTA_MESSAGE });
  }
  const image = await processImage(file.bytes);
  // Keys are grouped per organization (ADR-0011): `org/<id>/attachments/<uuid>`.
  const storageKey = `org/${actor.organizationId}/attachments/${randomUUID()}`;
  await storage.put(storageKey, image.data, { contentType: image.mimeType });
  try {
    const row = await repo.insertAttachment(db, {
      organizationId: actor.organizationId,
      storageKey,
      originalName: sanitizeFileName(file.name),
      mimeType: image.mimeType,
      sizeBytes: image.data.byteLength,
      width: image.width,
      height: image.height,
      uploadedBy: actor.userId,
    });
    return { ...toAttachmentDTO(row), status: 'pending' };
  } catch (err) {
    await storage.delete(storageKey).catch(() => undefined);
    throw err;
  }
}

/**
 * GET /attachments/:id: pending → only the uploader; linked → whoever may read the parent
 * (staff via `loadInScope`, or the assignee of the open thread; the student only for their
 * own task, question or milestone). Otherwise 404.
 */
export async function getAttachmentFile(
  actor: Actor,
  attachmentId: string,
  db: DbOrTx = getDb(),
  storage: FileStorage = getStorage(),
): Promise<{ bytes: Uint8Array; mimeType: string; originalName: string }> {
  if (!isUuid(attachmentId)) throw errors.notFound();
  const row = await repo.findAttachment(db, attachmentId);
  if (!row) throw errors.notFound();
  if (row.status === 'pending') {
    if (row.uploadedBy !== actor.userId) throw errors.notFound();
  } else if (actor.role === 'student') {
    const root = await findAttachmentRoot(db, attachmentId);
    if (!root || root.studentId !== actor.userId) throw errors.notFound();
  } else if (row.organizationId !== actor.organizationId) {
    throw errors.notFound();
  } else {
    try {
      await loadInScope(db, actor, 'attachment', attachmentId);
    } catch (err) {
      // An out-of-scope assignee reads the files of their thread while it is open (ADR-0004).
      const thread = (await findAttachmentRoot(db, attachmentId))?.thread;
      if (
        !thread ||
        thread.assigneeId !== actor.userId ||
        !(thread.status === 'open' || thread.status === 'answered')
      ) {
        throw err;
      }
    }
  }
  const bytes = await storage.get(row.storageKey);
  if (!bytes) {
    logger.error({ event: 'files.missing_object', attachmentId }, 'attachment object missing');
    throw errors.notFound();
  }
  return { bytes, mimeType: row.mimeType, originalName: row.originalName };
}

// ---- internal (other modules' services; no actor) --------------------------------------

/**
 * C4 / SEC-U9: links the actor's own `pending` attachments to a submission with one atomic
 * UPDATE, inside the caller's transaction. Another user's id, an already linked one and a
 * missing one all give the same 422 (`fields.attachmentIds`), and the caller's transaction
 * rolls back.
 */
export async function linkAttachmentsToSubmission(
  tx: DbOrTx,
  actorId: string,
  ids: readonly string[] | undefined,
  submissionId: string,
): Promise<void> {
  await linkAttachments(tx, actorId, ids, { submissionId });
}

/** C4 for a question message (same rule as submissions). */
export async function linkAttachmentsToQuestionMessage(
  tx: DbOrTx,
  actorId: string,
  ids: readonly string[] | undefined,
  questionMessageId: string,
): Promise<void> {
  await linkAttachments(tx, actorId, ids, { questionMessageId });
}

/** C4 for a milestone's evidence (same rule as submissions). */
export async function linkAttachmentsToMilestone(
  tx: DbOrTx,
  actorId: string,
  ids: readonly string[] | undefined,
  milestoneId: string,
): Promise<void> {
  await linkAttachments(tx, actorId, ids, { milestoneId });
}

async function linkAttachments(
  tx: DbOrTx,
  actorId: string,
  ids: readonly string[] | undefined,
  parent: repo.AttachmentParent,
): Promise<void> {
  const unique = [...new Set(ids ?? [])];
  if (unique.length === 0) return;
  if (unique.length > MAX_ATTACHMENTS_PER_REQUEST) {
    throw errors.validation({ attachmentIds: 'حداکثر ۱۰ پیوست مجاز است.' });
  }
  const linked = await repo.linkToParent(tx, unique, actorId, parent);
  if (linked.length !== unique.length) {
    throw errors.validation({ attachmentIds: 'مقدار نامعتبر است' });
  }
}

/** Linked attachments of question messages or milestones (DTOs keyed by parent id). */
export async function attachmentsByParent(
  db: DbOrTx,
  column: 'questionMessageId' | 'milestoneId',
  ids: readonly string[],
): Promise<Map<string, AttachmentDTO[]>> {
  const out = new Map<string, AttachmentDTO[]>();
  for (const row of await repo.listForParents(db, column, ids)) {
    const key = row[column];
    if (!key) continue;
    const list = out.get(key) ?? [];
    list.push(toAttachmentDTO(row));
    out.set(key, list);
  }
  return out;
}

/** Linked attachments of some submissions (DTOs keyed by submission id). */
export async function attachmentsBySubmission(
  db: DbOrTx,
  submissionIds: readonly string[],
): Promise<Map<string, AttachmentDTO[]>> {
  const rows = await repo.listForSubmissions(db, submissionIds);
  const out = new Map<string, AttachmentDTO[]>();
  for (const row of rows) {
    if (!row.submissionId) continue;
    const list = out.get(row.submissionId) ?? [];
    list.push(toAttachmentDTO(row));
    out.set(row.submissionId, list);
  }
  return out;
}

/** Deletes objects then rows; a failed object delete keeps the row for the next run. */
export async function purgeAttachments(
  ids: readonly string[],
  db: DbOrTx = getDb(),
  storage: FileStorage = getStorage(),
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const row of await repo.listByIds(db, ids)) {
    try {
      await storage.delete(row.storageKey);
      await repo.deleteAttachment(db, row.id);
      deleted += 1;
    } catch (err) {
      failed += 1;
      logger.error(
        { event: 'files.delete_failed', attachmentId: row.id, error: safeError(err) },
        'could not delete attachment',
      );
    }
  }
  return { deleted, failed };
}

/** Job `files.cleanup` (ADR-0007, 03:45 Tehran): pending uploads older than 24 hours. */
export async function cleanupPendingAttachments(
  now: Date = new Date(),
  db: DbOrTx = getDb(),
  storage: FileStorage = getStorage(),
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (;;) {
    const batch = await repo.listStalePending(db, new Date(now.getTime() - DAY_MS), 200);
    if (batch.length === 0) break;
    const result = await purgeAttachments(
      batch.map((b) => b.id),
      db,
      storage,
    );
    deleted += result.deleted;
    failed += result.failed;
    if (result.deleted === 0) break;
  }
  return { deleted, failed };
}
