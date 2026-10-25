import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from '../../lib/uuid';

/**
 * identity — users, invite/reset tokens, sessions, login throttling.
 * data-model.md section 2-1; ADR-0003 (with security changes C1, C2); ADR-0010 (erased_at).
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const USER_ROLES = ['admin', 'mentor', 'student'] as const;
export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export const TOKEN_PURPOSES = ['invite', 'password_reset'] as const;

const ts = (name?: string) =>
  name ? timestamp(name, { withTimezone: true }) : timestamp({ withTimezone: true });

export const users = pgTable(
  'users',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** E.164 (`+989121234567`); `erased:<id>` after account erasure (ADR-0010). */
    phone: text().notNull(),
    displayName: text().notNull(),
    role: text({ enum: USER_ROLES }).notNull(),
    status: text({ enum: USER_STATUSES }).notNull().default('invited'),
    /** argon2id PHC string of the *normalised* password; null until the invite is accepted. */
    passwordHash: text(),
    passwordChangedAt: ts(),
    lastLoginAt: ts(),
    lastSeenAt: ts(),
    createdBy: uuid().references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    erasedAt: ts(),
    /**
     * SEC-T5 (ADR-0003 9-9, followup F-01): when and with which User-Agent the INVITE (not a
     * reset) was accepted. Written in the token-consuming transaction; kept after
     * `auth.cleanup` deletes the token. The User-Agent is nulled on erasure.
     */
    inviteAcceptedAt: ts(),
    inviteAcceptedUserAgent: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_phone_key').on(t.phone),
    index('users_role_status_idx').on(t.role, t.status),
    check('users_phone_format', sql`${t.phone} ~ '^\\+[0-9]{10,15}$' OR ${t.erasedAt} IS NOT NULL`),
    check('users_role_check', sql`${t.role} IN ('admin', 'mentor', 'student')`),
    check('users_status_check', sql`${t.status} IN ('invited', 'active', 'disabled')`),
    check('users_erased_disabled', sql`${t.erasedAt} IS NULL OR ${t.status} = 'disabled'`),
    check(
      'users_invite_accepted_user_agent_length',
      sql`char_length(${t.inviteAcceptedUserAgent}) <= 512`,
    ),
  ],
);

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text({ enum: TOKEN_PURPOSES }).notNull(),
    /** SHA-256 (hex) of the 32-byte random token. The token itself is never stored. */
    tokenHash: text().notNull(),
    expiresAt: ts().notNull(),
    usedAt: ts(),
    revokedAt: ts(),
    phoneMismatchCount: smallint().notNull().default(0),
    usedUserAgent: text(),
    /** null only for CLI links (admin:create, admin:reset-link). */
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_tokens_token_hash_key').on(t.tokenHash),
    index('auth_tokens_open_idx')
      .on(t.userId, t.purpose)
      .where(sql`${t.usedAt} IS NULL AND ${t.revokedAt} IS NULL`),
    check('auth_tokens_purpose_check', sql`${t.purpose} IN ('invite', 'password_reset')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 (hex) of the cookie token. */
    tokenHash: text().notNull(),
    createdAt: ts().notNull().defaultNow(),
    expiresAt: ts().notNull(),
    lastUsedAt: ts().notNull().defaultNow(),
    ip: text(),
    userAgent: text(),
    revokedAt: ts(),
    /**
     * SEC-S7 (ADR-0003 8 and 9-12, followup F-06): last password re-confirmation on this
     * session (`POST /auth/reauth`). Sensitive admin actions need
     * max(created_at, reauth_at) within the last 30 minutes.
     */
    reauthAt: ts(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_active_idx').on(t.userId).where(sql`${t.revokedAt} IS NULL`),
  ],
);

/** Login / token rate limiting shared by all app instances (ADR-0003 section 4, SEC-R5). */
export const authThrottle = pgTable('auth_throttle', {
  key: text().primaryKey(),
  failures: integer().notNull().default(0),
  windowStartedAt: ts().notNull().defaultNow(),
  lockedUntil: ts(),
});
