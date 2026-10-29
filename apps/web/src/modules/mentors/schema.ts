import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationId, users } from '../identity/schema';

/**
 * mentors — the mentor directory (Coach Office sprint 4). Who mentors whom lives in
 * `enrollment_mentors` and `run_staff` (programs module); this module keeps each staff
 * member's card and reads the workload. Relative imports only (drizzle-kit).
 */

const ts = () => timestamp({ withTimezone: true });

/** A mentor's card in the directory: one per (organization, user). */
export const mentorProfiles = pgTable(
  'mentor_profiles',
  {
    organizationId: organizationId(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    specialties: text().array().notNull().default(sql`'{}'::text[]`),
    bio: text(),
    /** Most students as primary mentor; null = no limit. Advisory: assignment warns only. */
    capacity: integer(),
    acceptingStudents: boolean().notNull().default(true),
    updatedAt: ts().notNull().defaultNow(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    check('mentor_profiles_capacity_check', sql`${t.capacity} IS NULL OR ${t.capacity} >= 0`),
  ],
);
