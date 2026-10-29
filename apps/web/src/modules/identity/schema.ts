import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
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
import { SUPPORTED_LOCALES } from '../../i18n/config';
import { uuidv7 } from '../../lib/uuid';

/**
 * identity — organizations and memberships (ADR-0011), users, invite/reset tokens,
 * sessions, login throttling.
 * data-model.md section 2-1; ADR-0003 (with security changes C1, C2); ADR-0010 (erased_at).
 * Relative imports only: drizzle-kit does not resolve the `@/` alias.
 */

export const USER_ROLES = ['admin', 'mentor', 'student'] as const;
export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export const TOKEN_PURPOSES = ['invite', 'password_reset'] as const;
export const ORGANIZATION_STATUSES = ['active', 'suspended'] as const;
export const ORGANIZATION_ROLES = ['owner', 'admin', 'mentor', 'mentee'] as const;
export const MEMBERSHIP_STATUSES = ['active', 'disabled'] as const;

/** The organization migration 0006 created and filed all 0.1 data under. */
export const DEFAULT_ORGANIZATION_ID = '01920000-0000-7000-8000-00000000f001';

const ts = (name?: string) =>
  name ? timestamp(name, { withTimezone: true }) : timestamp({ withTimezone: true });

/** A tenant (ADR-0011): every row of organization data belongs to exactly one. */
export const organizations = pgTable(
  'organizations',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** Lower-case latin, digits and dashes; used by the CLI scripts. */
    slug: text().notNull(),
    name: text().notNull(),
    defaultLocale: text().notNull().default('fa'),
    /** IANA time zone; deadlines and "today" follow it (ADR-0013; 0.1 data is Tehran). */
    timezone: text().notNull().default('Asia/Tehran'),
    status: text({ enum: ORGANIZATION_STATUSES }).notNull().default('active'),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('organizations_slug_key').on(t.slug),
    check('organizations_slug_format', sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{1,62}$'`),
    check('organizations_status_check', sql`${t.status} IN ('active', 'suspended')`),
  ],
);

/**
 * `organization_id` of a root row (students, catalog rows, settings, attachments…): the
 * service sets it from the actor.
 */
export const organizationId = () =>
  uuid()
    .notNull()
    .references(() => organizations.id);

/**
 * `organization_id` of a child row. The `set_organization_id` trigger (migration 0006)
 * always copies it from the parent row, so callers never pass it and a child can never sit
 * in another organization than its parent (ADR-0011 section 3).
 */
export const inheritedOrganizationId = () =>
  uuid()
    .notNull()
    .references(() => organizations.id)
    .$defaultFn(() => sql`default`);

export const users = pgTable(
  'users',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** E.164 (`+989121234567`); `erased:<id>` after account erasure (ADR-0010). */
    phone: text().notNull(),
    displayName: text().notNull(),
    /**
     * Deprecated (ADR-0011): the role of the first membership, still written for the
     * contract migration that drops it. Read the role from `organization_memberships`.
     */
    role: text({ enum: USER_ROLES }).notNull(),
    /** Platform operator (CLI only in the MVP); grants no access to organization data. */
    isPlatformAdmin: boolean().notNull().default(false),
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

/**
 * A user's role in one organization (ADR-0011 section 1). One row per user and
 * organization; `users.status` stays the account state (invited / active / erased).
 */
export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    role: text({ enum: ORGANIZATION_ROLES }).notNull(),
    status: text({ enum: MEMBERSHIP_STATUSES }).notNull().default('active'),
    invitedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    disabledAt: ts(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('organization_memberships_org_user_key').on(t.organizationId, t.userId),
    index('organization_memberships_user_idx').on(t.userId),
    index('organization_memberships_org_role_idx').on(t.organizationId, t.role, t.status),
    check(
      'organization_memberships_role_check',
      sql`${t.role} IN ('owner', 'admin', 'mentor', 'mentee')`,
    ),
    check('organization_memberships_status_check', sql`${t.status} IN ('active', 'disabled')`),
  ],
);

/**
 * Per-account settings (ADR-0013): the interface language for now. No row = the
 * organization's default language. Account-wide, so the same in every organization.
 */
export const userPreferences = pgTable(
  'user_preferences',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    locale: text({ enum: SUPPORTED_LOCALES }).notNull(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [check('user_preferences_locale_check', sql`${t.locale} IN ('fa', 'en')`)],
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
    /** The organization this session works in; the role comes from that membership. */
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
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
