import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { users } from '../identity/schema';
import { milestones } from '../milestones/schema';
import { questionMessages } from '../questions/schema';
import { submissions } from '../tasks/schema';

/**
 * files — image attachments (data-model.md 2-5, security.md C4 / SEC-U1..U9).
 *
 * `storage_key` is a random UUID path, never the row id or the user's file name (SEC-U8).
 * `mime_type`, `size_bytes`, `width`, `height` come from the RE-ENCODED output, not from the
 * client. A row is `pending` until one atomic UPDATE links it to exactly one parent (CHECK).
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const ATTACHMENT_STATUSES = ['pending', 'linked'] as const;
export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const ts = () => timestamp({ withTimezone: true });

export const attachments = pgTable(
  'attachments',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    storageKey: text().notNull(),
    /** Display only; sanitised (no path, no control or bidi characters, ≤ 200). */
    originalName: text().notNull(),
    mimeType: text({ enum: ATTACHMENT_MIME_TYPES }).notNull(),
    sizeBytes: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    uploadedBy: uuid()
      .notNull()
      .references(() => users.id),
    status: text({ enum: ATTACHMENT_STATUSES }).notNull().default('pending'),
    submissionId: uuid().references(() => submissions.id),
    questionMessageId: uuid().references(() => questionMessages.id),
    milestoneId: uuid().references(() => milestones.id),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attachments_storage_key_key').on(t.storageKey),
    index('attachments_uploader_status_idx').on(t.uploadedBy, t.status),
    index('attachments_uploader_created_idx').on(t.uploadedBy, t.createdAt),
    index('attachments_submission_idx').on(t.submissionId),
    index('attachments_question_message_idx').on(t.questionMessageId),
    index('attachments_milestone_idx').on(t.milestoneId),
    check('attachments_status_check', sql`${t.status} IN ('pending', 'linked')`),
    check(
      'attachments_mime_check',
      sql`${t.mimeType} IN ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check(
      'attachments_parent_check',
      sql`num_nonnulls(${t.submissionId}, ${t.questionMessageId}, ${t.milestoneId}) = CASE WHEN ${t.status} = 'pending' THEN 0 ELSE 1 END`,
    ),
  ],
);
