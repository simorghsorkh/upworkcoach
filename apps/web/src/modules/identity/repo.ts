import { and, asc, desc, eq, gt, inArray, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import type { Role } from '@/server/auth/current-user';
import type { DbOrTx } from '@/server/db';
import { authTokens, sessions, users } from './schema';

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
  role: Role;
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

export async function countActiveAdmins(db: DbOrTx, exceptUserId?: string): Promise<number> {
  const conditions: SQL[] = [eq(users.role, 'admin'), eq(users.status, 'active')];
  if (exceptUserId) conditions.push(sql`${users.id} <> ${exceptUserId}`);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(...conditions));
  return row?.count ?? 0;
}

export async function countAdmins(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.erasedAt)));
  return row?.count ?? 0;
}

export async function listUsers(db: DbOrTx, filter: { role?: Role; status?: UserStatus }) {
  const conditions: SQL[] = [];
  if (filter.role) conditions.push(eq(users.role, filter.role));
  if (filter.status) conditions.push(eq(users.status, filter.status));
  // SEC-T5 (F-01): «invite accepted» lives on `users`, so it survives auth.cleanup.
  return db
    .select(publicUserColumns)
    .from(users)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(users.role), asc(users.displayName), asc(users.id))
    .limit(1000);
}

/** Locks one user row for an admin edit (PATCH /users/:id, /role). */
export async function lockUser(db: DbOrTx, id: string): Promise<UserRow | null> {
  const [row] = await db
    .select(publicUserColumns)
    .from(users)
    .where(eq(users.id, id))
    .for('update');
  return row ?? null;
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

export async function listActiveStaff(db: DbOrTx) {
  return db
    .select({ id: users.id, displayName: users.displayName, role: users.role })
    .from(users)
    .where(and(inArray(users.role, ['admin', 'mentor']), eq(users.status, 'active')))
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
      role: users.role,
      userStatus: users.status,
      userErasedAt: users.erasedAt,
      passwordChangedAt: users.passwordChangedAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash));
  return row ?? null;
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

export async function revokeAllSessions(db: DbOrTx, userId: string, now: Date): Promise<number> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
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
