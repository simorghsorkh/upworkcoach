import { z } from 'zod';
import {
  cursorInput,
  httpsUrl,
  limitInput,
  requiredLongText,
  requiredShortText,
  shortText,
  uuidInput,
} from '@/server/http/schemas';
import type { AttachmentDTO } from '../files/contracts';
import type { StudentSummaryDTO } from '../students/contracts';
import type {
  QUESTION_AWAITING,
  QUESTION_PRIORITIES,
  QUESTION_SOURCES,
  QUESTION_STATUSES,
} from './schema';

/**
 * questions — question threads (PRD F8, api.md section 10, data-model.md 2-8). Inputs are
 * `.strict()` (SEC-A7). Students only ever get `StudentQuestion*DTO`: no assignee id, no
 * canned-response id, no student summary (ADR-0004 section 3).
 */

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export type QuestionAwaiting = (typeof QUESTION_AWAITING)[number];
export type QuestionPriority = (typeof QUESTION_PRIORITIES)[number];
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

const linkInput = z.strictObject({ url: httpsUrl, label: shortText(120).nullable().optional() });
const linksInput = z.array(linkInput).max(10, 'حداکثر ۱۰ لینک مجاز است.');
const attachmentIdsInput = z.array(uuidInput).max(10, 'حداکثر ۱۰ پیوست مجاز است.');
const messageBody = requiredLongText(10_000, 'متن پیام را بنویس.');

/**
 * POST /me/questions (S). `taskId` = a question about one of the student's own tasks; this is
 * also how a student asks for a deadline extension (only staff extend; api.md 6).
 */
export const createQuestionInput = z.strictObject({
  subject: requiredShortText(200, 'موضوع سؤال را بنویس.'),
  body: messageBody,
  links: linksInput.optional(),
  attachmentIds: attachmentIdsInput.optional(),
  taskId: uuidInput.optional(),
  priority: z.enum(['normal', 'urgent']).optional(),
});
export type CreateQuestionInput = z.infer<typeof createQuestionInput>;

/** POST /questions/:id/messages (A, M, S). `cannedResponseId` is staff-only (else 422). */
export const postMessageInput = z.strictObject({
  body: messageBody,
  links: linksInput.optional(),
  attachmentIds: attachmentIdsInput.optional(),
  cannedResponseId: uuidInput.optional(),
});
export type PostMessageInput = z.infer<typeof postMessageInput>;

/** PUT /questions/:id/assignee (A). */
export const changeAssigneeInput = z.strictObject({ assigneeId: uuidInput });
export type ChangeAssigneeInput = z.infer<typeof changeAssigneeInput>;

/** GET /questions (A, M): scope OR assignee = me. `assigneeId` is admin-only. */
export const listQuestionsQuery = z.strictObject({
  status: z.enum(['open', 'answered', 'closed']).optional(),
  awaiting: z.enum(['team', 'student']).optional(),
  assigneeId: uuidInput.optional(),
  studentId: uuidInput.optional(),
  limit: limitInput.optional(),
  cursor: cursorInput.optional(),
});
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuery>;

/** GET /me/questions (S). */
export const myQuestionsQuery = z.strictObject({
  status: z.enum(['open', 'answered', 'closed']).optional(),
});
export type MyQuestionsQuery = z.infer<typeof myQuestionsQuery>;

// ---- DTOs ------------------------------------------------------------------------------

export type QuestionSlaDTO = {
  slaHours: number;
  elapsedHours: number;
  remainingHours: number;
  breached: boolean;
  warning: boolean;
};

/** Staff list row (GET /questions, «امروز»). */
export type StaffQuestionListItemDTO = {
  id: string;
  subject: string;
  status: QuestionStatus;
  awaiting: QuestionAwaiting;
  priority: QuestionPriority;
  source: QuestionSource;
  student: { id: string; displayName: string };
  assignee: { id: string; displayName: string };
  task: { id: string; title: string } | null;
  messageCount: number;
  createdAt: string;
  lastMessageAt: string | null;
  awaitingTeamSince: string | null;
  firstResponseAt: string | null;
  /** SLA while the ball is with the team (business hours, decision E6); else null. */
  sla: QuestionSlaDTO | null;
  /** = `sla.remainingHours` (api.md section 10); null when not awaiting the team. */
  slaRemainingHours: number | null;
  /** The actor sees this thread only as its assignee (outside their scope; ADR-0004). */
  viaAssignment: boolean;
};

export type StaffQuestionListDTO = { items: StaffQuestionListItemDTO[]; nextCursor: string | null };

export type StaffQuestionMessageDTO = {
  id: string;
  author: { id: string; displayName: string; role: 'admin' | 'mentor' | 'student' };
  body: string;
  links: Array<{ url: string; label: string | null }>;
  attachments: AttachmentDTO[];
  cannedResponseId: string | null;
  createdAt: string;
  editedAt: string | null;
};

/** GET /questions/:id for staff: thread, messages (oldest first) and the record summary. */
export type StaffQuestionDetailDTO = StaffQuestionListItemDTO & {
  messages: StaffQuestionMessageDTO[];
  studentSummary: StudentSummaryDTO;
  closedAt: string | null;
  updatedAt: string;
};

/** Student view of a message: no staff ids. */
export type StudentQuestionMessageDTO = {
  id: string;
  author: { displayName: string; isMe: boolean; isTeam: boolean };
  body: string;
  links: Array<{ url: string; label: string | null }>;
  attachments: AttachmentDTO[];
  createdAt: string;
};

/** Student list row (GET /me/questions). `hasNewReply` = the ball is with the student. */
export type StudentQuestionDTO = {
  id: string;
  subject: string;
  status: QuestionStatus;
  awaiting: QuestionAwaiting;
  priority: QuestionPriority;
  task: { id: string; title: string } | null;
  messageCount: number;
  hasNewReply: boolean;
  createdAt: string;
  lastMessageAt: string | null;
};

export type StudentQuestionListDTO = {
  items: StudentQuestionDTO[];
  /** e.g. «معمولاً تا ۲۴ ساعت» (settings.questions; F8). */
  expectedResponseText: string;
};

export type StudentQuestionDetailDTO = StudentQuestionDTO & {
  messages: StudentQuestionMessageDTO[];
  expectedResponseText: string;
};
