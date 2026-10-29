import { z } from 'zod';
import { intInput, longText, queryFlag, tagsInput, uuidInput } from '@/server/http/schemas';
import type { EnrollmentMentorRole, EnrollmentStatus, StaffRole } from '../programs/schema';

/** GET /mentors (A, M): the organization's active staff with their cards and workload. */
export const mentorDirectoryQuery = z.strictObject({
  q: z.string().max(100).optional(),
  specialty: z.string().max(160).optional(),
  accepting: queryFlag.optional(),
});
export type MentorDirectoryQuery = z.infer<typeof mentorDirectoryQuery>;

/** PUT /mentors/:id/profile (A; M for themselves). Omitted fields stay. */
export const updateMentorProfileInput = z.strictObject({
  specialties: tagsInput.optional(),
  bio: longText(1000).optional(),
  capacity: z.union([intInput(0, 1000), z.null()]).optional(),
  acceptingStudents: z.boolean().optional(),
});
export type UpdateMentorProfileInput = z.infer<typeof updateMentorProfileInput>;

/** POST /mentors/:id/transfer (A): every student they are primary mentor of moves. */
export const transferStudentsInput = z.strictObject({
  toMentorId: uuidInput,
  reason: longText(500).optional(),
});
export type TransferStudentsInput = z.infer<typeof transferStudentsInput>;

export type MentorProfileDTO = {
  specialties: string[];
  bio: string | null;
  /** Most students as primary mentor; null = no limit. */
  capacity: number | null;
  acceptingStudents: boolean;
};

export type MentorCardDTO = {
  id: string;
  displayName: string;
  role: 'admin' | 'mentor';
  profile: MentorProfileDTO;
  /** Students of active or paused enrollments (completed and dropped ones are history). */
  counts: {
    /** Distinct students they work with: as primary, secondary or run staff. */
    students: number;
    primary: number;
    secondary: number;
    /** Runs they staff (not archived). */
    runs: number;
    /** Submitted tasks they review that are past the review SLA. */
    overdueReviews: number;
  };
  /** primary ≥ capacity. */
  atCapacity: boolean;
};

export type MentorDirectoryDTO = {
  items: MentorCardDTO[];
  /** Every specialty in use, for the filter. */
  specialties: string[];
};

export type MentorStudentDTO = {
  enrollmentId: string;
  student: { id: string; displayName: string };
  run: { id: string; title: string; isLegacy: boolean };
  role: EnrollmentMentorRole;
  enrollmentStatus: EnrollmentStatus;
  since: string;
};

/** GET /mentors/:id (A; M for themselves). */
export type MentorDetailDTO = MentorCardDTO & {
  students: MentorStudentDTO[];
  runs: Array<{ id: string; title: string; role: StaffRole; activeCount: number }>;
  canEdit: boolean;
  canTransfer: boolean;
};

export type TransferResultDTO = { moved: number };
