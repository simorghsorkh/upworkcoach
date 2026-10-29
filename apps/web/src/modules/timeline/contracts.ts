import { z } from 'zod';
import {
  cursorInput,
  isoInstantInput,
  limitInput,
  requiredLongText,
  tagsInput,
} from '@/server/http/schemas';
import { NOTE_KINDS, NOTE_VISIBILITIES } from './schema';

/**
 * timeline — notes and the record timeline (api.md section 7, PRD F5). Inputs are
 * `.strict()` (SEC-A7). Students only ever get `SharedNoteDTO` (ADR-0004 section 3).
 */

export type NoteKind = (typeof NOTE_KINDS)[number];
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

const noteBody = requiredLongText(10_000, 'متن یادداشت را بنویس.');

/** POST /students/:id/notes (A, M). Default visibility: internal. */
export const createNoteInput = z.strictObject({
  kind: z.enum(NOTE_KINDS).optional(),
  visibility: z.enum(NOTE_VISIBILITIES).optional(),
  body: noteBody,
  tags: tagsInput.optional(),
  /** Default now; a past time logs yesterday's session. */
  occurredAt: isoInstantInput.optional(),
});
export type CreateNoteInput = z.infer<typeof createNoteInput>;

/** PATCH /notes/:id (A; M = author and student in scope). */
export const updateNoteInput = z.strictObject({
  kind: z.enum(NOTE_KINDS).optional(),
  visibility: z.enum(NOTE_VISIBILITIES).optional(),
  body: noteBody.optional(),
  tags: tagsInput.optional(),
  occurredAt: isoInstantInput.optional(),
  ifUpdatedAt: isoInstantInput.optional(),
});
export type UpdateNoteInput = z.infer<typeof updateNoteInput>;

/** GET /students/:id/notes (A, M). */
export const listNotesQuery = z.strictObject({
  visibility: z.enum(NOTE_VISIBILITIES).optional(),
  kind: z.enum(NOTE_KINDS).optional(),
  limit: limitInput.optional(),
  cursor: cursorInput.optional(),
});
export type ListNotesQuery = z.infer<typeof listNotesQuery>;

/** GET /me/shared-notes (S). */
export const sharedNotesQuery = z.strictObject({
  limit: limitInput.optional(),
  cursor: cursorInput.optional(),
});
export type SharedNotesQuery = z.infer<typeof sharedNotesQuery>;

/**
 * Timeline filter categories (F5 «فیلتر نوع»): `note` = manual notes; the others group the
 * automatic event types (e.g. `task` = task.*, submission.*, review.*).
 */
export const TIMELINE_CATEGORIES = [
  'note',
  'student',
  'stage',
  'profile',
  'task',
  'question',
  'checkin',
  'milestone',
  'flag',
  'health',
] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

/** GET /students/:id/timeline (A, M). `types` = comma-separated categories; default all. */
export const timelineQuery = z.strictObject({
  types: z
    .string()
    .max(200)
    .transform((value, ctx) => {
      const parts = [
        ...new Set(
          value
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p !== ''),
        ),
      ];
      if (
        parts.length === 0 ||
        !parts.every((p): p is TimelineCategory =>
          (TIMELINE_CATEGORIES as readonly string[]).includes(p),
        )
      ) {
        ctx.addIssue({ code: 'custom', message: 'مقدار نامعتبر است' });
        return z.NEVER;
      }
      return parts as TimelineCategory[];
    })
    .optional(),
  limit: limitInput.optional(),
  cursor: cursorInput.optional(),
});
export type TimelineQuery = z.infer<typeof timelineQuery>;

// ---- DTOs ------------------------------------------------------------------------------

/** Staff view of a note (never returned on /me routes). */
export type NoteDTO = {
  id: string;
  studentId: string;
  kind: NoteKind;
  visibility: NoteVisibility;
  body: string;
  tags: string[];
  occurredAt: string;
  author: { id: string; displayName: string };
  /** The actor may edit or delete it (admin, or author with the student in scope). */
  /** The viewer wrote it (only the author makes a note private). */
  isAuthor: boolean;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteListDTO = { items: NoteDTO[]; nextCursor: string | null };

/**
 * The ONLY note shape a student ever receives (GET /me/shared-notes): shared, not deleted;
 * no tags, no visibility, no author id.
 */
export type SharedNoteDTO = {
  id: string;
  kind: NoteKind;
  body: string;
  occurredAt: string;
  author: { displayName: string };
};

export type SharedNoteListDTO = { items: SharedNoteDTO[]; nextCursor: string | null };

export type TimelineItemDTO =
  | {
      kind: 'event';
      id: string;
      /** e.g. `stage.changed`, `task.status_changed`. */
      type: string;
      category: TimelineCategory;
      occurredAt: string;
      actor: { id: string; displayName: string } | null;
      subject: { type: string; id: string } | null;
      /** Raw facts (ids, statuses); names of ids are in `refs`. */
      data: Record<string, unknown>;
    }
  | {
      kind: 'note';
      id: string;
      /** The note kind (`note`, `session`, …). */
      type: NoteKind;
      category: 'note';
      occurredAt: string;
      actor: { id: string; displayName: string };
      note: NoteDTO;
    };

/**
 * `refs`: display names for ids that appear in event data (stages, users), so the UI can
 * render «از مرحله‌ی ۲ به ۳» without extra calls.
 */
export type TimelineDTO = {
  items: TimelineItemDTO[];
  nextCursor: string | null;
  refs: {
    stages: Record<string, { name: string; displayCode: string }>;
    users: Record<string, { displayName: string }>;
  };
};
