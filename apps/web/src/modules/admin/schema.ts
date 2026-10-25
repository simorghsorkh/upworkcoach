import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';
import { users } from '../identity/schema';

/**
 * admin — audit log of security and management events (data-model.md section 2-1,
 * security.md SEC-L7). Never contains passwords, tokens or invite/reset links.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** null = the system or a CLI run on the server console. */
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    targetType: text(),
    targetId: uuid(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** From getClientIp(); set to null after 90 days (ADR-0010). */
    ip: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_target_idx').on(t.targetType, t.targetId),
    index('audit_log_action_created_idx').on(t.action, t.createdAt),
    index('audit_log_created_idx').on(t.createdAt),
  ],
);
