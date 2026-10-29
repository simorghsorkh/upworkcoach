import { and, asc, desc, eq, gt, inArray, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import type { Locale } from '@/i18n/config';
import type { OrganizationRole, Role } from '@/server/auth/current-user';
import type { DbOrTx } from '@/server/db';
import {
  authTokens,
  organizationMemberships,
  organizations,
  sessions,
  userPreferences,
  users,
} from './schema';

/**
 * identity — queries. Only used inside the module. Columns are always selected explicitly
 * (SEC-A9); `password_hash` is read only by `getCredentialsByPhone`.
 */

type UserStatus = 'invited' | 'active' | 'disabled';

const publicUserColumns = {
  id: users.id,
  phone: users.phone,
  displayName: users.displayName,
  role: users.role,
  status: users.status,
  passwordChangedAt: users.passwordChangedAt,
  lastLoginAt: users.lastLoginAt,
  lastSeenAt: users.lastSeenAt,
  erasedAt: users.erasedAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  inviteAcceptedAt: users.inviteAcceptedAt,
  inviteAcceptedUserAgent: users.inviteAcceptedUserAgent,
};

export type UserRow = {
  id: string;
  phone: string;
  displayName: string;
  /** For a member row: the 0.1 role of the membership (legacyRole). */
  role: Role;
  /** For a member row: `disabled` when the membership is disabled, else the account state. */
  status: UserStatus;
  passwordChangedAt: Date | null;
  lastLoginAt: Date | null;
  lastSeenAt: Date | null;
  erasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** SEC-T5 (F-01). */
  inviteAcceptedAt: Date | null;
  inviteAcceptedUserAgent: string | null;
};

// ---- members of an organization (ADR-0011) ----------------------------------------------

/** Organization role → the 0.1 role the access rules check (same mapping as legacyRole). */
const memberRole = sql<Role>`CASE ${organizationMemberships.role} WHEN 'mentee' THEN 'student' WHEN 'mentor' THEN 'mentor' ELSE 'admin' END`;
const memberStatus = sql<UserStatus>`CASE WHEN ${organizationMemberships.status} = 'disabled' THEN 'disabled' ELSE ${users.status} END`;

const memberColumns = {
  ...publicUserColumns,
  role: memberRole,
  status: memberStatus,
  organizationRole: organizationMemberships.role,
};

export type MemberRow = UserRow & { organizationRole: OrganizationRole };

const ADMIN_ROLES: OrganizationRole[] = ['owner', 'admin'];

function memberOf(organizationId: string) {
  return and(
    eq(organizationMemberships.userId, users.id),
    eq(organizationMemberships.organizationId, organizationId),
  );
}

/** A user as seen from one organization; null when they are not a member of it. */
export async function findMember(
  db: DbOrTx,
  organizationId: string,
  userId: string,
): Promise<MemberRow | null> {
  const [row] = await db
    .select(memberColumns)
    .from(users)
    .innerJoin(organizationMemberships, memberOf(organizationId))
    .where(eq(users.id, userId));
  return row ?? null;
}

/** Locks the user and membership rows for an admin edit (PATCH /users/:id, /role). */
export async function lockMember(
  db: DbOrTx,
  organizationId: string,
  userId: string,
): Promise<MemberRow | null> {
  const [row] = await db
    .select(memberColumns)
    .from(users)
    .innerJoin(organizationMemberships, memberOf(organizationId))
    .where(eq(users.id, userId))
    .for('update');
  return row ?? null;
}

export async function insertMembership(
  db: DbOrTx,
  values: {
    organizationId: string;
    userId: string;
    role: OrganizationRole;
    invitedBy: string | null;
  },
): Promise<void> {
  await db.insert(organizationMemberships).values(values);
}

export async function updateMembership(
  db: DbOrTx,
  organizationId: string,
  userId: string,
  values: { role?: OrganizationRole; status?: 'active' | 'disabled' },
  now: Date,
): Promise<void> {
  const disabledAt =
    values.status === undefined ? {} : { disabledAt: values.status === 'disabled' ? now : null };
  await db
    .update(organizationMemberships)
    .set({ ...values, ...disabledAt, updatedAt: now })
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, userId),
      ),
    );
}

/** Memberships of this user in other organizations (any status). */
export async function countOtherMemberships(
  db: DbOrTx,
  userId: string,
  organizationId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        sql`${organizationMemberships.organizationId} <> ${organizationId}`,
      ),
    );
  return row?.count ?? 0;
}

export type ActiveMembership = {
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
  /** Organization defaults (ADR-0013): language without a user preference, time zone. */
  organizationLocale: string;
  organizationTimeZone: string;
  /** The user's own language preference (null = organization default). */
  preferredLocale: string | null;
};

/**
 * Active memberships in active organizations, oldest first: the first one is where a login
 * or an accepted link lands (ADR-0011 section 2).
 */
export async function listActiveMemberships(
  db: DbOrTx,
  userId: string,
): Promise<ActiveMembership[]> {
  return db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: organizationMemberships.role,
      organizationLocale: organizations.defaultLocale,
      organizationTimeZone: organizations.timezone,
      preferredLocale: userPreferences.locale,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .leftJoin(userPreferences, eq(userPreferences.userId, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.status, 'active'),
        eq(organizations.status, 'active'),
      ),
    )
    .orderBy(asc(organizationMemberships.createdAt), asc(organizationMemberships.id));
}

/** Every membership of the user (CLI erasure). */
export async function listMembershipsOfUser(db: DbOrTx, userId: string) {
  return db
    .select({
      organizationId: organizationMemberships.organizationId,
      role: organizationMemberships.role,
      status: organizationMemberships.status,
    })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, userId));
}

export async function disableMembershipsOfUser(
  db: DbOrTx,
  userId: string,
  now: Date,
): Promise<void> {
  await db
    .update(organizationMemberships)
    .set({ status: 'disabled', disabledAt: now, updatedAt: now })
    .where(
      and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.status, 'active')),
    );
}

// ---- users ---------------------------------------------------------------------------

export async function getCredentialsByPhone(db: DbOrTx, phone: string) {
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
      displayName: users.displayName,
      phone: users.phone,
      passwordHash: users.passwordHash,
      erasedAt: users.erasedAt,
    })
    .from(users)
    .where(eq(users.phone, phone));
  return row ?? null;
}

export async function findUserById(db: DbOrTx, id: string): Promise<UserRow | null> {
  const [row] = await db.select(publicUserColumns).from(users).where(eq(users.id, id));
  return row ?? null;
}

export async function findUserByPhone(db: DbOrTx, phone: string): Promise<UserRow | null> {
  const [row] = await db.select(publicUserColumns).from(users).where(eq(users.phone, phone));
  return row ?? null;
}

export async function insertUser(
  db: DbOrTx,
  values: { role: Role; displayName: string; phone: string; createdBy: string | null },
): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ ...values, status: 'invited' })
    .returning({ id: users.id });
  if (!row) throw new Error('insertUser returned no row');
  return row.id;
}

export async function setPasswordAndActivate(
  db: DbOrTx,
  userId: string,
  passwordHash: string,
  now: Date,
  activate: boolean,
): Promise<void> {
  await db
    .update(users)
    .set({
      passwordHash,
      passwordChangedAt: now,
      updatedAt: now,
      lastLoginAt: now,
      ...(activate ? { status: 'active' as const } : {}),
    })
    .where(eq(users.id, userId));
}

export async function updatePassword(
  db: DbOrTx,
  userId: string,
  passwordHash: string,
  now: Date,
): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
    .where(eq(users.id, userId));
}

export async function updatePasswordHashOnly(db: DbOrTx, userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function markLogin(db: DbOrTx, userId: string, now: Date): Promise<void> {
  await db.update(users).set({ lastLoginAt: now, lastSeenAt: now }).where(eq(users.id, userId));
}

export async function touchUserSeen(db: DbOrTx, userId: string, now: Date): Promise<void> {
  await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, userId));
}

/** Active owners and admins of the organization (active membership and account). */
export async function countActiveAdmins(
  db: DbOrTx,
  organizationId: string,
  exceptUserId?: string,
): Promise<number> {
  const conditions: SQL[] = [
    inArray(organizationMemberships.role, ADMIN_ROLES),
    eq(organizationMemberships.status, 'active'),
    eq(users.status, 'active'),
  ];
  if (exceptUserId) conditions.push(sql`${users.id} <> ${exceptUserId}`);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .innerJoin(organizationMemberships, memberOf(organizationId))
    .where(and(...conditions));
  return row?.count ?? 0;
}

/** Owners and admins of the organization that are not erased (bootstrap check). */
export async function countAdmins(db: DbOrTx, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .innerJoin(organizationMemberships, memberOf(organizationId))
    .where(and(inArray(organizationMemberships.role, ADMIN_ROLES), isNull(users.erasedAt)));
  return row?.count ?? 0;
}

/** Active members of an organization (erased accounts excluded). */
export async function countMembers(db: DbOrTx, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .innerJoin(organizationMemberships, memberOf(organizationId))
    .where(and(eq(organizationMemberships.status, 'active'), isNull(users.erasedAt)));
  return row?.count ?? 0;
}

export async function listMembers(
  db: DbOrTx,
  organizationId: string,
  filter: { role?: Role; status?: UserStatus },
): Promise<MemberRow[]> {
  const conditions: SQL[] = [];
  if (filter.role) conditions.push(sql`${memberRole} = ${filter.role}`);
  if (filter.status) conditions.push(sql`${memberStatus} = ${filter.status}`);
  // SEC-T5 (F-01): «invite accepted» lives on `users`, so it survives auth.cleanup.
  return db
    .select(memberColumns)
    .from(users)
    .innerJoin(organizationMemberships, memberOf(organizationId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(memberRole), asc(users.displayName), asc(users.id))
    .limit(1000);
}

export async function updateUserFields(
  db: DbOrTx,
  id: string,
  values: { displayName?: string; phone?: string; status?: UserStatus; role?: Role },
  now: Date,
): Promise<void> {
  await db
    .update(users)
    .set({ ...values, updatedAt: now })
    .where(eq(users.id, id));
}

/** F-01: written in the transaction that consumes an INVITE token (never for a reset). */
export async function markInviteAccepted(
  db: DbOrTx,
  userId: string,
  now: Date,
  userAgent: string | null,
): Promise<void> {
  await db
    .update(users)
    .set({ inviteAcceptedAt: now, inviteAcceptedUserAgent: userAgent?.slice(0, 512) ?? null })
    .where(eq(users.id, userId));
}

/** Active admins and mentors of the organization. */
export async function listActiveStaff(db: DbOrTx, organizationId: string) {
  return db
    .select({ id: users.id, displayName: users.displayName, role: memberRole })
    .from(users)
    .innerJoin(organizationMemberships, memberOf(organizationId))
    .where(
      and(
        inArray(organizationMemberships.role, ['owner', 'admin', 'mentor']),
        eq(organizationMemberships.status, 'active'),
        eq(users.status, 'active'),
      ),
    )
    .orderBy(asc(users.displayName), asc(users.id));
}

export async function eraseUserRow(db: DbOrTx, userId: string, now: Date): Promise<void> {
  await db
    .update(users)
    .set({
      displayName: 'کاربر حذف‌شده',
      phone: sql`'erased:' || ${users.id}::text`,
      passwordHash: null,
      status: 'disabled',
      erasedAt: now,
      updatedAt: now,
      inviteAcceptedUserAgent: null,
    })
    .where(eq(users.id, userId));
}

// ---- auth_tokens ---------------------------------------------------------------------

export async function revokeOpenTokens(
  db: DbOrTx,
  userId: string,
  purpose: 'invite' | 'password_reset',
  now: Date,
): Promise<void> {
  await db
    .update(authTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        isNull(authTokens.revokedAt),
      ),
    );
}

export async function insertToken(
  db: DbOrTx,
  values: {
    userId: string;
    purpose: 'invite' | 'password_reset';
    tokenHash: string;
    expiresAt: Date;
    createdBy: string | null;
  },
): Promise<void> {
  await db.insert(authTokens).values(values);
}

/** An unused, unrevoked, unexpired token with its user. */
export async function findUsableToken(db: DbOrTx, tokenHash: string, now: Date) {
  const [row] = await db
    .select({
      tokenId: authTokens.id,
      purpose: authTokens.purpose,
      expiresAt: authTokens.expiresAt,
      userId: users.id,
      displayName: users.displayName,
      phone: users.phone,
      role: users.role,
      status: users.status,
      erasedAt: users.erasedAt,
    })
    .from(authTokens)
    .innerJoin(users, eq(users.id, authTokens.userId))
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        isNull(authTokens.usedAt),
        isNull(authTokens.revokedAt),
        gt(authTokens.expiresAt, now),
      ),
    );
  return row ?? null;
}

/** Atomic increment; revokes the token when the limit is reached. Returns the new count. */
export async function recordPhoneMismatch(
  db: DbOrTx,
  tokenId: string,
  limit: number,
  now: Date,
): Promise<{ count: number; revoked: boolean }> {
  const [row] = await db
    .update(authTokens)
    .set({
      phoneMismatchCount: sql`${authTokens.phoneMismatchCount} + 1`,
      revokedAt: sql`CASE WHEN ${authTokens.phoneMismatchCount} + 1 >= ${limit} THEN ${now} ELSE ${authTokens.revokedAt} END`,
    })
    .where(and(eq(authTokens.id, tokenId), isNull(authTokens.usedAt), isNull(authTokens.revokedAt)))
    .returning({ count: authTokens.phoneMismatchCount, revokedAt: authTokens.revokedAt });
  if (!row) return { count: limit, revoked: false };
  return { count: row.count, revoked: row.revokedAt !== null };
}

/**
 * SEC-T2: single-use consumption. Two concurrent accepts → only one gets a row back.
 */
export async function consumeToken(
  db: DbOrTx,
  tokenHash: string,
  userAgent: string | null,
  now: Date,
): Promise<{ userId: string; purpose: 'invite' | 'password_reset' } | null> {
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: now, usedUserAgent: userAgent })
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        isNull(authTokens.usedAt),
        isNull(authTokens.revokedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning({ userId: authTokens.userId, purpose: authTokens.purpose });
  return row ?? null;
}

export async function deleteTokensOfUser(db: DbOrTx, userId: string): Promise<void> {
  await db.delete(authTokens).where(eq(authTokens.userId, userId));
}

// ---- sessions ------------------------------------------------------------------------

export async function insertSession(
  db: DbOrTx,
  values: {
    userId: string;
    organizationId: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(sessions)
    .values({ ...values, lastUsedAt: values.createdAt })
    .returning({ id: sessions.id });
  if (!row) throw new Error('insertSession returned no row');
  return row.id;
}

export async function findSessionWithUser(db: DbOrTx, tokenHash: string) {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      lastUsedAt: sessions.lastUsedAt,
      revokedAt: sessions.revokedAt,
      reauthAt: sessions.reauthAt,
      userId: users.id,
      displayName: users.displayName,
      phone: users.phone,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationStatus: organizations.status,
      organizationLocale: organizations.defaultLocale,
      organizationTimeZone: organizations.timezone,
      preferredLocale: userPreferences.locale,
      organizationRole: organizationMemberships.role,
      membershipStatus: organizationMemberships.status,
      userStatus: users.status,
      userErasedAt: users.erasedAt,
      passwordChangedAt: users.passwordChangedAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(organizations, eq(organizations.id, sessions.organizationId))
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.organizationId, sessions.organizationId),
        eq(organizationMemberships.userId, sessions.userId),
      ),
    )
    .leftJoin(userPreferences, eq(userPreferences.userId, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash));
  return row ?? null;
}

/** Sets the account's interface language (ADR-0013). */
export async function upsertLocale(
  db: DbOrTx,
  userId: string,
  locale: Locale,
  now: Date,
): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, locale, updatedAt: now })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { locale, updatedAt: now } });
}

export async function touchSession(
  db: DbOrTx,
  sessionId: string,
  now: Date,
  expiresAt: Date,
): Promise<void> {
  await db
    .update(sessions)
    .set({ lastUsedAt: now, expiresAt })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** SEC-S7 (F-06): the password was re-confirmed on this (still active) session. */
export async function markSessionReauth(
  db: DbOrTx,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  const result = await db
    .update(sessions)
    .set({ reauthAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  return (result.rowCount ?? 0) > 0;
}

export async function revokeSessionByHash(db: DbOrTx, tokenHash: string, now: Date) {
  const [row] = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id, userId: sessions.userId });
  return row ?? null;
}

/** Every open session of the user, or only those working in `organizationId`. */
export async function revokeAllSessions(
  db: DbOrTx,
  userId: string,
  now: Date,
  organizationId?: string,
): Promise<number> {
  const conditions: SQL[] = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (organizationId) conditions.push(eq(sessions.organizationId, organizationId));
  const result = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(...conditions));
  return result.rowCount ?? 0;
}

export async function listActiveSessions(db: DbOrTx, userId: string, now: Date) {
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
    })
    .from(sessions)
    .where(
      and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
    )
    .orderBy(desc(sessions.lastUsedAt))
    .limit(100);
}

/** Revokes one session only if it belongs to `userId` (ADR-0004: other users' sessions → 404). */
export async function revokeOwnSession(
  db: DbOrTx,
  userId: string,
  sessionId: string,
  now: Date,
): Promise<boolean> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)),
    );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteSessionsOfUser(db: DbOrTx, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// ---- retention (auth.cleanup) ----------------------------------------------------------

export async function deleteStaleSessionsAndTokens(db: DbOrTx, cutoff: Date): Promise<void> {
  await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, cutoff), lt(sessions.revokedAt, cutoff)));
  await db
    .delete(authTokens)
    .where(
      or(
        lt(authTokens.expiresAt, cutoff),
        lt(authTokens.usedAt, cutoff),
        lt(authTokens.revokedAt, cutoff),
      ),
    );
}
