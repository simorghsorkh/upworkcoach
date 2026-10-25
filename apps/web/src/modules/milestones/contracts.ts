import { z } from 'zod';
import { dayInput, longText, moneyInput, requiredLongText, uuidInput } from '@/server/http/schemas';
import type { AttachmentDTO } from '../files/contracts';

/**
 * milestones — real results and the North Star (PRD F9, api.md section 12). Inputs are
 * `.strict()`: `status` is not a field of any input (a student proposal is always
 * `proposed`, a staff record always `approved`; T-ESC).
 */

const currencyInput = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'کد ارز سه‌حرفی است (مثلاً USD).')
  .transform((v) => v.toUpperCase());

const milestoneFields = {
  typeId: uuidInput,
  /** Tehran day of the event; not in the future. */
  occurredOn: dayInput,
  platformId: uuidInput.nullable().optional(),
  amount: moneyInput.nullable().optional(),
  currency: currencyInput.nullable().optional(),
  evidenceText: longText(2000).nullable().optional(),
  attachmentIds: z.array(uuidInput).max(10, 'حداکثر ۱۰ پیوست مجاز است.').optional(),
};

/** POST /students/:id/milestones (A, M in scope): recorded as `approved`. */
export const createMilestoneInput = z.strictObject(milestoneFields);
export type CreateMilestoneInput = z.infer<typeof createMilestoneInput>;

/** POST /me/milestones (S): a proposal; evidence required when the type says so. */
export const proposeMilestoneInput = z.strictObject(milestoneFields);
export type ProposeMilestoneInput = z.infer<typeof proposeMilestoneInput>;

/** POST /milestones/:id/reject (A, M in scope). */
export const rejectMilestoneInput = z.strictObject({
  reason: requiredLongText(500, 'دلیل رد را بنویس.'),
});
export type RejectMilestoneInput = z.infer<typeof rejectMilestoneInput>;

/** GET /dashboard/north-star (A). Without `from`/`to`: the current Jalali month (Tehran). */
export const northStarQuery = z.strictObject({
  from: dayInput.optional(),
  to: dayInput.optional(),
});
export type NorthStarQuery = z.infer<typeof northStarQuery>;

export type MilestoneStatus = 'proposed' | 'approved' | 'rejected';

/** Staff view (GET /students/:id/milestones). */
export type MilestoneDTO = {
  id: string;
  studentId: string;
  type: { id: string; name: string; countsForNorthStar: boolean };
  occurredOn: string;
  platform: { id: string; name: string } | null;
  /** Decimal as a string (`"250.00"`). */
  amount: string | null;
  currency: string | null;
  evidenceText: string | null;
  attachments: AttachmentDTO[];
  status: MilestoneStatus;
  proposedBy: { id: string; displayName: string };
  decidedBy: { id: string; displayName: string } | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

/** Student view (GET /me/milestones): own approved and proposed ones; no staff ids. */
export type StudentMilestoneDTO = {
  id: string;
  type: { id: string; name: string };
  occurredOn: string;
  platform: { id: string; name: string } | null;
  amount: string | null;
  currency: string | null;
  evidenceText: string | null;
  attachments: AttachmentDTO[];
  status: 'proposed' | 'approved';
  createdAt: string;
  decidedAt: string | null;
};

/**
 * GET /dashboard/north-star (A): «دو عدد و یک میانه» (F9) + the AI dataset count (G4).
 * `medianDaysToFirst`: median over students of (first approved North Star milestone −
 * joined day), in days; null without any.
 */
export type NorthStarDTO = {
  from: string;
  to: string;
  approvedInRange: number;
  approvedTotal: number;
  medianDaysToFirst: number | null;
  studentsWithFirst: number;
  labeledProposalCount: number;
  /** Proposals still waiting for a decision (all types). */
  pendingProposals: number;
};
