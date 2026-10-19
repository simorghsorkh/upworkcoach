import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Database schema entry point.
 *
 * Domain tables live in `src/modules/<module>/schema.ts` (tech-stack.md section 2)
 * and are picked up by drizzle-kit through the glob in drizzle.config.ts.
 * Re-export them here so the typed `db` client knows them, e.g.:
 *
 *   export * from '../../modules/students/schema';
 *
 * Schema files use relative imports only (drizzle-kit does not read the `@/` alias).
 */

/** Infrastructure-only table used to verify connectivity and migrations. No domain data. */
export const healthCheck = pgTable('_health', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  note: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
