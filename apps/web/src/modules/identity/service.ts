import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { maskPhone, normalizeIranMobile } from '@/lib/phone';
import { normalizeFa } from '@/lib/text-fa';
import { isUuid } from '@/lib/uuid';
import type { Actor, MeDTO, Role } from '@/server/auth/current-user';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { getEnv } from '@/server/env';
import { errors } from '@/server/http/errors';
import { logger } from '@/server/logger';
import { type FileStorage, getStorage } from '@/server/storage';
import { isStudentInScope } from '../access/scope';
import { anonymizeAuditForUser, applyAuditRetention, recordAudit } from '../admin/service';
import { detachForErasure } from '../files/repo';
import { purgeAttachments } from '../files/service';
import { eraseTransitionNotes } from '../path/transitions';
import { eraseSprint4OfStudent } from '../questions/erasure';
import { countOpenQuestionsAssignedTo } from '../questions/transfer';
import { countOpenRemindersOwnedBy, eraseRemindersAboutStudent } from '../reminders/erasure';
import { touchStudentActivity } from '../students/activity';
import { countStudentsOfMentor, eraseStudentRecord } from '../students/erasure';
import { rebuildStudentSearchText } from '../students/search-text';
import { eraseTasksOfStudent } from '../tasks/erasure';
import { eraseTimelineOfStudent } from '../timeline/erasure';
import { recordTimelineEvent } from '../timeline/events';
import {
  type InvitationCreatedDTO,
  type InviteLinkDTO,
  type MentorOptionDTO,
  PHONE_INVALID_MESSAGE,
  type ReauthDTO,
  type ResetLinkDTO,
  type SessionDTO,
  type TokenLookupDTO,
  type UpdateUserInput,
  type UserListItemDTO,
} from './contracts';
import {
  checkPasswordPolicy,
  dummyVerifier,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './password';
import {
  adminOnly,
  type Decision,
  inviteLinkDecision,
  resetLinkDecision,
  staffOnly,
} from './policy';
import * as repo from './repo';
import {
  absoluteExpiry,
  isRecentlyAuthenticated,
  isSessionValid,
  lastPasswordAt,
  REAUTH_WINDOW_MS,
  shouldTouch,
  slidingExpiry,
} from './session-policy';
import {
  clearThrottleForPhone,
  clearThrottleKeys,
  deleteStaleThrottleRows,
  lockRemainingSeconds,
  readThrottleStates,
  registerFailure,
  THROTTLE_RULES,
  throttleKeys,
} from './throttle';
import {
  generateToken,
  looksLikeToken,
  sha256Hex,
  signDeviceCookie,
  verifyDeviceCookie,
} from './tokens';

/**
 * identity — the only entry point of the module (tech-stack.md section 3).
 * ADR-0003 (auth, with C1/C2), ADR-0004 (access, C3), ADR-0010 (erasure).
 */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export const TOKEN_TTL = {
  invite: 7 * DAY,
  password_reset: 24 * HOUR,
  /** CLI links (admin:create, admin:reset-link) — SEC-T6 / SEC-T7. */
  cli: 1 * HOUR,
} as const;

export const PHONE_MISMATCH_LIMIT = 5;
export const PHONE_MISMATCH_MESSAGE = 'این شماره با این لینک هم‌خوانی ندارد';

/** What a request carries that identity cares about. Values come only from server/http. */
export type RequestMeta = {
  ip: string;
  userAgent: string | null;
  /** Raw value of the trusted-device cookie, if any. */
  deviceCookie?: string | null;
  /** Raw value of the session cookie, if any. */
  sessionToken?: string | null;
};

export type IssuedSession = {
  token: string;
  expiresAt: Date;
  /** The cookie lives until the absolute cap; the server enforces the sliding expiry. */
  cookieExpiresAt: Date;
};

export type AuthResult = {
  user: MeDTO;
  session: IssuedSession;
  /** New trusted-device cookie value (ADR-0003 section 4). */
  deviceCookie: string;
};

// ---- helpers -------------------------------------------------------------------------

function toMe(u: { id: string; displayName: string; role: Role; phone: string }): MeDTO {
  return { id: u.id, displayName: u.displayName, role: u.role, phone: u.phone };
}

function assertDecision(decision: Decision): void {
  switch (decision) {
    case 'ok':
      return;
    case 'forbidden':
      throw errors.forbidden();
    case 'not_found':
      throw errors.notFound();
    case 'conflict':
      throw errors.conflict();
  }
}

let ephemeralDeviceSecret: string | undefined;

/**
 * DEVICE_COOKIE_SECRET is required in production (env.ts refuses to start without it).
 * Elsewhere an in-memory random secret is used, so device cookies stop being trusted after
 * a restart — harmless for development.
 */
function deviceSecret(): string {
  const configured = getEnv().DEVICE_COOKIE_SECRET;
  if (configured) return configured;
  ephemeralDeviceSecret ??= randomBytes(32).toString('base64url');
  return ephemeralDeviceSecret;
}

/** `${APP_BASE_URL}/invite#t=<token>` for a token from {@link createInvitedUser} (C1). */
export function inviteUrlFor(token: string): string {
  return linkFor('/invite', token);
}

function linkFor(path: '/invite' | '/reset', token: string): string {
  // C1: the token is in the fragment, so it never reaches server or proxy logs.
  const url = new URL(path, getEnv().APP_BASE_URL);
  return `${url.origin}${url.pathname}#t=${token}`;
}

async function issueToken(
  db: DbOrTx,
  userId: string,
  purpose: 'invite' | 'password_reset',
  ttlMs: number,
  createdBy: string | null,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  // A new link revokes the open ones of the same user and purpose (SEC-T8).
  await repo.revokeOpenTokens(db, userId, purpose, now);
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + ttlMs);
  await repo.insertToken(db, {
    userId,
    purpose,
    tokenHash: sha256Hex(token),
    expiresAt,
    createdBy,
  });
  return { token, expiresAt };
}

async function createSession(
  db: DbOrTx,
  user: { id: string; role: Role },
  meta: RequestMeta,
  now: Date,
): Promise<IssuedSession> {
  const token = generateToken();
  const expiresAt = slidingExpiry(user.role, now, now);
  await repo.insertSession(db, {
    userId: user.id,
    tokenHash: sha256Hex(token),
    createdAt: now,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
  });
  return { token, expiresAt, cookieExpiresAt: absoluteExpiry(user.role, now) };
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code;
  const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505' || causeCode === '23505';
}

// ---- sessions ------------------------------------------------------------------------

export type AuthenticatedSession = {
  sessionId: string;
  user: MeDTO;
  /** SEC-S7 (F-06): last time a password was entered on this session (sign-in or reauth). */
  lastPasswordAt: Date;
};

/**
 * SEC-S3: validates the session cookie on every request. Role and status come from `users`,
 * never from a cache. With `touch`, last_used_at / expires_at / last_seen_at are refreshed
 * at most every 15 minutes (allowed side effect of GET, SEC-C4).
 */
export async function authenticateSession(
  token: string | null | undefined,
  options: { touch?: boolean; now?: Date; db?: DbOrTx } = {},
): Promise<AuthenticatedSession | null> {
  if (!token || !looksLikeToken(token)) return null;
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const row = await repo.findSessionWithUser(db, sha256Hex(token));
  if (!row) return null;
  if (!isSessionValid(row, row.role, now)) return null;

  if (options.touch !== false) {
    if (shouldTouch(row.lastUsedAt, now)) {
      await repo.touchSession(db, row.sessionId, now, slidingExpiry(row.role, row.createdAt, now));
    }
    if (shouldTouch(row.lastSeenAt, now)) {
      await repo.touchUserSeen(db, row.userId, now);
      // R-INACT base, at most once an hour (data-model.md 2-3).
      if (row.role === 'student' && (await touchStudentActivity(db, row.userId, now))) {
        await recomputeHealthAfterActivity(row.userId);
      }
    }
  }
  return {
    sessionId: row.sessionId,
    user: toMe({ ...row, id: row.userId }),
    lastPasswordAt: lastPasswordAt(row.createdAt, row.reauthAt),
  };
}

export async function logout(sessionToken: string, db: DbOrTx = getDb()): Promise<void> {
  await repo.revokeSessionByHash(db, sha256Hex(sessionToken), new Date());
}

/**
 * R-INACT input changed (at most once an hour per student; data-model.md 4-1). Loaded lazily
 * (the health module reads catalog settings); best-effort and never throws.
 */
async function recomputeHealthAfterActivity(studentId: string): Promise<void> {
  const { recomputeHealthSafe } = await import('../health/recompute');
  await recomputeHealthSafe(studentId);
}

// ---- login ---------------------------------------------------------------------------

/**
 * POST /auth/login (ADR-0003 section 4, SEC-R1..R7).
 * Same 401 for unknown / invited / disabled / wrong password; the dummy hash is verified
 * so timing does not reveal accounts; counting is identical for unknown phones.
 */
export async function login(
  input: { phone: string; password: string },
  meta: RequestMeta,
  db: DbOrTx = getDb(),
): Promise<AuthResult> {
  const phone = normalizeIranMobile(input.phone);
  if (!phone) throw errors.validation({ phone: PHONE_INVALID_MESSAGE });

  const now = new Date();
  const keys = {
    pi: throttleKeys.loginPhoneIp(phone, meta.ip),
    p: throttleKeys.loginPhone(phone),
    ip: throttleKeys.loginIp(meta.ip),
  };
  const [states, cred] = await Promise.all([
    readThrottleStates(db, [keys.pi, keys.p, keys.ip]),
    repo.getCredentialsByPhone(db, phone),
  ]);

  const deviceUserId = verifyDeviceCookie(meta.deviceCookie, deviceSecret());
  const trustedDevice = cred !== null && deviceUserId === cred.id;
  const retryAfter = Math.max(
    lockRemainingSeconds(states.get(keys.pi), now),
    lockRemainingSeconds(states.get(keys.ip), now),
    trustedDevice ? 0 : lockRemainingSeconds(states.get(keys.p), now),
  );
  if (retryAfter > 0) throw errors.tooManyAttempts(retryAfter);

  let ok = false;
  if (cred && cred.status === 'active' && cred.erasedAt === null && cred.passwordHash) {
    ok = await verifyPassword(cred.passwordHash, input.password);
  } else {
    await dummyVerifier.verify(input.password);
  }

  if (!ok || !cred?.passwordHash) {
    const [pi, p, ip] = await Promise.all([
      registerFailure(db, keys.pi, THROTTLE_RULES.loginPhoneIp, now),
      registerFailure(db, keys.p, THROTTLE_RULES.loginPhone, now),
      registerFailure(db, keys.ip, THROTTLE_RULES.loginIp, now),
    ]);
    const lockedNow = [
      pi.failures === THROTTLE_RULES.loginPhoneIp.threshold ? 'phone_ip' : null,
      p.failures === THROTTLE_RULES.loginPhone.threshold ? 'phone' : null,
      ip.failures === THROTTLE_RULES.loginIp.threshold ? 'ip' : null,
    ].filter((v): v is string => v !== null);
    logger.info(
      { event: 'auth.login_failed', userId: cred?.id, phone: cred ? undefined : maskPhone(phone) },
      'login failed',
    );
    if (lockedNow.length > 0) {
      logger.warn(
        { event: 'auth.locked', layers: lockedNow, userId: cred?.id, role: cred?.role },
        'login locked',
      );
      // SEC-L7: audit only for existing accounts.
      if (cred && lockedNow.some((layer) => layer !== 'ip')) {
        await recordAudit(db, {
          actorId: null,
          action: 'auth.locked',
          targetType: 'user',
          targetId: cred.id,
          data: { layers: lockedNow.filter((layer) => layer !== 'ip') },
          ip: meta.ip,
        });
      }
    }
    throw errors.invalidCredentials();
  }

  if (needsRehash(cred.passwordHash)) {
    await repo.updatePasswordHashOnly(db, cred.id, await hashPassword(input.password));
  }

  const session = await createSession(db, cred, meta, now);
  await repo.markLogin(db, cred.id, now);
  if (cred.role === 'student' && (await touchStudentActivity(db, cred.id, now))) {
    await recomputeHealthAfterActivity(cred.id);
  }
  await clearThrottleKeys(db, [keys.pi]);
  logger.info({ event: 'auth.login_succeeded', userId: cred.id }, 'login succeeded');
  return {
    user: toMe(cred),
    session,
    deviceCookie: signDeviceCookie(cred.id, deviceSecret()),
  };
}

// ---- own password and sessions --------------------------------------------------------

export const CURRENT_PASSWORD_WRONG = 'رمز فعلی درست نیست.';

/**
 * POST /auth/change-password (api.md section 2, SEC-S4): a wrong current password counts
 * toward `pwchange:u:<id>` (5 in 15 minutes); on success every session is revoked and the
 * current one is rotated (new row, new token).
 */
export async function changePassword(
  actor: Actor,
  input: { currentPassword: string; newPassword: string },
  meta: RequestMeta,
  db: Db = getDb(),
): Promise<AuthResult> {
  const now = new Date();
  const key = throttleKeys.passwordChange(actor.userId);
  const states = await readThrottleStates(db, [key]);
  const retryAfter = lockRemainingSeconds(states.get(key), now);
  if (retryAfter > 0) throw errors.tooManyAttempts(retryAfter);

  const user = await repo.findUserById(db, actor.userId);
  if (user?.status !== 'active' || user.erasedAt) throw errors.unauthenticated();
  const cred = await repo.getCredentialsByPhone(db, user.phone);
  const ok = cred?.passwordHash
    ? await verifyPassword(cred.passwordHash, input.currentPassword)
    : false;
  if (!ok) {
    await registerFailure(db, key, THROTTLE_RULES.passwordChange, now);
    throw errors.validation({ currentPassword: CURRENT_PASSWORD_WRONG });
  }
  const policyError = checkPasswordPolicy(input.newPassword, {
    role: user.role,
    phone: user.phone,
  });
  if (policyError) throw errors.validation({ newPassword: policyError });

  const passwordHash = await hashPassword(input.newPassword);
  const session = await db.transaction(async (tx) => {
    await repo.updatePassword(tx, user.id, passwordHash, now);
    const revoked = await repo.revokeAllSessions(tx, user.id, now);
    const fresh = await createSession(tx, user, meta, now);
    await recordAudit(tx, {
      actorId: user.id,
      action: 'session.revoked_all',
      targetType: 'user',
      targetId: user.id,
      data: { reason: 'password_change', count: revoked },
      ip: meta.ip,
    });
    return fresh;
  });
  await clearThrottleKeys(db, [key]);
  return { user: toMe(user), session, deviceCookie: signDeviceCookie(user.id, deviceSecret()) };
}

/** GET /auth/sessions — only the actor's own active sessions. */
export async function listOwnSessions(
  actor: Actor,
  currentSessionId: string,
  db: DbOrTx = getDb(),
): Promise<SessionDTO[]> {
  const rows = await repo.listActiveSessions(db, actor.userId, new Date());
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt.toISOString(),
    userAgent: r.userAgent,
    ip: r.ip,
    current: r.id === currentSessionId,
  }));
}

/** DELETE /auth/sessions/:id — another user's (or a missing) session → 404. */
export async function revokeOwnSession(
  actor: Actor,
  sessionId: string,
  db: DbOrTx = getDb(),
): Promise<void> {
  const done = isUuid(sessionId)
    ? await repo.revokeOwnSession(db, actor.userId, sessionId, new Date())
    : false;
  if (!done) throw errors.notFound();
}

// ---- invite / reset tokens -------------------------------------------------------------

async function assertTokenIpNotLocked(db: DbOrTx, ip: string, now: Date): Promise<string> {
  const key = throttleKeys.tokenIp(ip);
  const states = await readThrottleStates(db, [key]);
  const retryAfter = lockRemainingSeconds(states.get(key), now);
  if (retryAfter > 0) throw errors.tooManyAttempts(retryAfter);
  return key;
}

async function tokenFailure(db: DbOrTx, key: string, now: Date): Promise<void> {
  await registerFailure(db, key, THROTTLE_RULES.tokenIp, now);
}

/** A token is usable only while its user is in the matching state. */
function tokenMatchesUserState(row: {
  purpose: 'invite' | 'password_reset';
  status: string;
  erasedAt: Date | null;
}): boolean {
  if (row.erasedAt !== null) return false;
  return row.purpose === 'invite' ? row.status === 'invited' : row.status === 'active';
}

/** POST /auth/tokens/lookup (C1). No phone in the answer, not even masked. */
export async function lookupToken(
  token: string,
  meta: RequestMeta,
  db: DbOrTx = getDb(),
): Promise<TokenLookupDTO> {
  const now = new Date();
  const key = await assertTokenIpNotLocked(db, meta.ip, now);
  const row = looksLikeToken(token) ? await repo.findUsableToken(db, sha256Hex(token), now) : null;
  if (!row || !tokenMatchesUserState(row)) {
    await tokenFailure(db, key, now);
    throw errors.tokenExpired();
  }
  return {
    purpose: row.purpose,
    displayName: row.displayName,
    expiresAt: row.expiresAt.toISOString(),
  };
}

/**
 * POST /auth/tokens/accept (C1, SEC-T2..T5): full phone required; 5 wrong phones revoke the
 * token; atomic single-use consumption; all previous sessions (and the request's own session
 * cookie, whoever it belongs to) are revoked; a new session is issued.
 */
export async function acceptToken(
  input: { token: string; phone: string; password: string },
  meta: RequestMeta,
  db: Db = getDb(),
): Promise<AuthResult> {
  const now = new Date();
  const key = await assertTokenIpNotLocked(db, meta.ip, now);
  const tokenHash = looksLikeToken(input.token) ? sha256Hex(input.token) : null;
  const row = tokenHash ? await repo.findUsableToken(db, tokenHash, now) : null;
  if (!tokenHash || !row || !tokenMatchesUserState(row)) {
    await tokenFailure(db, key, now);
    throw errors.tokenExpired();
  }

  const phone = normalizeIranMobile(input.phone);
  if (phone !== row.phone) {
    const { revoked } = await repo.recordPhoneMismatch(db, row.tokenId, PHONE_MISMATCH_LIMIT, now);
    await tokenFailure(db, key, now);
    if (revoked) {
      await recordAudit(db, {
        actorId: null,
        action: 'auth.token_revoked_mismatch',
        targetType: 'user',
        targetId: row.userId,
        data: { purpose: row.purpose },
        ip: meta.ip,
      });
      logger.warn({ event: 'auth.token_revoked_mismatch', userId: row.userId }, 'token revoked');
    }
    throw errors.validation({ phone: PHONE_MISMATCH_MESSAGE });
  }

  const policyError = checkPasswordPolicy(input.password, { role: row.role, phone: row.phone });
  if (policyError) throw errors.validation({ password: policyError });

  // Hash outside the transaction (it is slow and queued).
  const passwordHash = await hashPassword(input.password);

  const result = await db.transaction(async (tx) => {
    const consumed = await repo.consumeToken(
      tx,
      tokenHash,
      meta.userAgent?.slice(0, 500) ?? null,
      now,
    );
    if (!consumed) return null;
    await repo.setPasswordAndActivate(
      tx,
      consumed.userId,
      passwordHash,
      now,
      consumed.purpose === 'invite',
    );
    if (consumed.purpose === 'invite') {
      // SEC-T5 (F-01): kept on `users`, so it survives auth.cleanup of the token.
      await repo.markInviteAccepted(tx, consumed.userId, now, meta.userAgent);
    }
    const revokedCount = await repo.revokeAllSessions(tx, consumed.userId, now);
    if (meta.sessionToken && looksLikeToken(meta.sessionToken)) {
      await repo.revokeSessionByHash(tx, sha256Hex(meta.sessionToken), now);
    }
    const session = await createSession(tx, { id: consumed.userId, role: row.role }, meta, now);
    await recordAudit(tx, {
      actorId: consumed.userId,
      action: consumed.purpose === 'invite' ? 'user.invite_accepted' : 'user.password_reset',
      targetType: 'user',
      targetId: consumed.userId,
      ip: meta.ip,
    });
    if (revokedCount > 0) {
      await recordAudit(tx, {
        actorId: consumed.userId,
        action: 'session.revoked_all',
        targetType: 'user',
        targetId: consumed.userId,
        data: { reason: consumed.purpose, count: revokedCount },
        ip: meta.ip,
      });
    }
    if (consumed.purpose === 'invite' && row.role === 'student') {
      await recordTimelineEvent(tx, {
        studentId: consumed.userId,
        type: 'invite.accepted',
        actorId: consumed.userId,
        data: {},
        occurredAt: now,
      });
    }
    return { session, purpose: consumed.purpose };
  });
  if (!result) throw errors.tokenExpired();

  if (result.purpose === 'password_reset') {
    // SEC-R5: a reset by link clears the global per-phone lock.
    await clearThrottleKeys(db, [throttleKeys.loginPhone(row.phone)]);
  }
  logger.info(
    { event: 'auth.token_accepted', userId: row.userId, purpose: result.purpose },
    'token accepted',
  );
  return {
    user: toMe({ id: row.userId, displayName: row.displayName, role: row.role, phone: row.phone }),
    session: result.session,
    deviceCookie: signDeviceCookie(row.userId, deviceSecret()),
  };
}

// ---- users and invitations (admin / mentor) -----------------------------------------------

/**
 * Creates a user in `invited` state and its first invite token, inside the caller's
 * transaction. Used by POST /invitations, the CLI, and (sprint 2) POST /students.
 * Throws 409 PHONE_TAKEN for a duplicate phone.
 */
export async function createInvitedUser(
  tx: DbOrTx,
  values: { role: Role; displayName: string; phone: string; createdBy: string | null },
  options: { ttlMs?: number; now?: Date } = {},
): Promise<{ userId: string; token: string; expiresAt: Date }> {
  const now = options.now ?? new Date();
  const phone = normalizeIranMobile(values.phone);
  if (!phone) throw errors.validation({ phone: PHONE_INVALID_MESSAGE });
  const displayName = normalizeFa(values.displayName);
  if (!displayName) throw errors.validation({ displayName: 'نام را وارد کن.' });
  if (await repo.findUserByPhone(tx, phone)) throw errors.phoneTaken();
  let userId: string;
  try {
    userId = await repo.insertUser(tx, { ...values, phone, displayName });
  } catch (err) {
    if (isUniqueViolation(err)) throw errors.phoneTaken();
    throw err;
  }
  const { token, expiresAt } = await issueToken(
    tx,
    userId,
    'invite',
    options.ttlMs ?? TOKEN_TTL.invite,
    values.createdBy,
    now,
  );
  return { userId, token, expiresAt };
}

/** POST /invitations — admin invites a mentor or another admin (api.md section 3). */
export async function createInvitation(
  actor: Actor,
  input: { role: 'mentor' | 'admin'; displayName: string; phone: string },
  meta: RequestMeta,
  db: Db = getDb(),
): Promise<InvitationCreatedDTO> {
  assertDecision(adminOnly(actor));
  const created = await db.transaction(async (tx) => {
    const result = await createInvitedUser(tx, { ...input, createdBy: actor.userId });
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'user.invited',
      targetType: 'user',
      targetId: result.userId,
      data: { role: input.role },
      ip: meta.ip,
    });
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'user.invite_link_created',
      targetType: 'user',
      targetId: result.userId,
      data: { creatorRole: actor.role, targetRole: input.role },
      ip: meta.ip,
    });
    return result;
  });
  return {
    userId: created.userId,
    inviteUrl: linkFor('/invite', created.token),
    expiresAt: created.expiresAt.toISOString(),
  };
}

/** POST /users/:id/invite-link (C3: mentors only for invited students in their scope). */
export async function createInviteLink(
  actor: Actor,
  targetId: string,
  meta: RequestMeta,
  db: Db = getDb(),
): Promise<InviteLinkDTO> {
  if (actor.role === 'student') throw errors.forbidden();
  return db.transaction(async (tx) => {
    const target = isUuid(targetId) ? await repo.findUserById(tx, targetId) : null;
    // The role is checked explicitly first, so the scope lookup only runs for students.
    const inScope =
      actor.role === 'mentor' && target?.role === 'student'
        ? await isStudentInScope(tx, actor, target.id)
        : false;
    assertDecision(inviteLinkDecision(actor, target, inScope));
    if (!target) throw errors.notFound();
    const now = new Date();
    const { token, expiresAt } = await issueToken(
      tx,
      target.id,
      'invite',
      TOKEN_TTL.invite,
      actor.userId,
      now,
    );
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'user.invite_link_created',
      targetType: 'user',
      targetId: target.id,
      data: { creatorRole: actor.role, targetRole: target.role },
      ip: meta.ip,
    });
    return { inviteUrl: linkFor('/invite', token), expiresAt: expiresAt.toISOString() };
  });
}

/** POST /users/:id/reset-link — admin only, 24 h (ADR-0003 section 7). */
export async function createResetLink(
  actor: Actor,
  targetId: string,
  meta: RequestMeta,
  db: Db = getDb(),
): Promise<ResetLinkDTO> {
  if (actor.role !== 'admin') throw errors.forbidden();
  return db.transaction(async (tx) => {
    const target = isUuid(targetId) ? await repo.findUserById(tx, targetId) : null;
    assertDecision(resetLinkDecision(actor, target));
    if (!target) throw errors.notFound();
    const now = new Date();
    const { token, expiresAt } = await issueToken(
      tx,
      target.id,
      'password_reset',
      TOKEN_TTL.password_reset,
      actor.userId,
      now,
    );
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'user.reset_link_created',
      targetType: 'user',
      targetId: target.id,
      data: { creatorRole: actor.role, targetRole: target.role },
      ip: meta.ip,
    });
    return { resetUrl: linkFor('/reset', token), expiresAt: expiresAt.toISOString() };
  });
}

/** GET /users — admin only. */
export async function listUsers(
  actor: Actor,
  filter: { role?: Role; status?: 'invited' | 'active' | 'disabled' },
  db: DbOrTx = getDb(),
): Promise<{ items: UserListItemDTO[]; nextCursor: null }> {
  assertDecision(adminOnly(actor));
  const rows = await repo.listUsers(db, filter);
  return { items: rows.map(toUserListItem), nextCursor: null };
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toUserListItem(r: repo.UserRow): UserListItemDTO {
  return {
    id: r.id,
    displayName: r.displayName,
    phone: r.erasedAt ? null : r.phone,
    role: r.role,
    status: r.status,
    lastLoginAt: iso(r.lastLoginAt),
    lastSeenAt: iso(r.lastSeenAt),
    createdAt: r.createdAt.toISOString(),
    inviteAcceptedAt: iso(r.inviteAcceptedAt),
    inviteAcceptedDevice: r.inviteAcceptedUserAgent,
    erasedAt: iso(r.erasedAt),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ---- admin edits of users (api.md section 3, followup F-02) ------------------------------

const LAST_ADMIN_MESSAGE = 'این آخرین مدیر فعال است؛ اول مدیر دیگری را فعال کن.';
const ERASED_MESSAGE = 'این حساب حذف شده است و تغییر نمی‌کند.';
const STALE_MESSAGE = 'این کاربر در این فاصله تغییر کرده است؛ صفحه را تازه کن.';

type UserStatus = 'invited' | 'active' | 'disabled';

/** Serialises every change that can remove an active admin (disable, role change). */
async function lockAdminSet(tx: DbOrTx): Promise<void> {
  await tx.execute(sqlAdvisoryLock('identity.admin_set'));
}

async function lockTargetForAdminEdit(
  tx: DbOrTx,
  actor: Actor,
  targetId: string,
): Promise<repo.UserRow> {
  assertDecision(adminOnly(actor));
  if (!isUuid(targetId)) throw errors.notFound();
  await lockAdminSet(tx);
  const target = await repo.lockUser(tx, targetId);
  if (!target) throw errors.notFound();
  if (target.erasedAt) throw errors.conflict(ERASED_MESSAGE);
  return target;
}

async function revokeAllWithAudit(
  tx: DbOrTx,
  actor: Actor,
  userId: string,
  reason: string,
  meta: { ip?: string | null },
  now: Date,
): Promise<number> {
  const count = await repo.revokeAllSessions(tx, userId, now);
  await recordAudit(tx, {
    actorId: actor.userId,
    action: 'session.revoked_all',
    targetType: 'user',
    targetId: userId,
    data: { reason, count },
    ip: meta.ip ?? null,
  });
  return count;
}

/** Status after a PATCH (see updateUser). */
function nextStatus(target: repo.UserRow, wanted: 'active' | 'disabled'): UserStatus {
  if (wanted === 'disabled') return 'disabled';
  if (target.status === 'active') return 'active';
  if (target.status === 'invited') {
    throw errors.conflict('این کاربر هنوز دعوت را نپذیرفته است؛ لینک دعوت تازه بساز.');
  }
  // Re-enable: only a user who once set a password becomes active again.
  return target.passwordChangedAt !== null ? 'active' : 'invited';
}

/**
 * PATCH /users/:id (A). Name, phone, `active`/`disabled` (ADR-0003 sections 5 and 8,
 * SEC-S4, SEC-L7):
 * - erased target → 409; `ifUpdatedAt` different from the row → 409.
 * - disabling the last active admin → 409. Disabling revokes every session and open link.
 * - `active` re-enables a disabled user; one who never accepted the invite goes back to
 *   `invited` (needs a fresh invite link). `active` on an invited user → 409.
 * - a new phone (409 PHONE_TAKEN when used) revokes every session; `user.phone_changed`
 *   is audited without the numbers.
 * - for a student, `students.search_text` is rebuilt in the same transaction.
 */
export async function updateUser(
  actor: Actor,
  targetId: string,
  input: UpdateUserInput,
  meta: RequestMeta,
  db: Db = getDb(),
): Promise<UserListItemDTO> {
  const now = new Date();
  try {
    return await db.transaction(async (tx) => {
      const target = await lockTargetForAdminEdit(tx, actor, targetId);
      if (
        input.ifUpdatedAt !== undefined &&
        input.ifUpdatedAt.getTime() !== target.updatedAt.getTime()
      ) {
        throw errors.conflict(STALE_MESSAGE);
      }
      const values: { displayName?: string; phone?: string; status?: UserStatus } = {};
      if (input.displayName !== undefined && input.displayName !== target.displayName) {
        values.displayName = input.displayName;
      }
      if (input.phone !== undefined && input.phone !== target.phone) {
        const owner = await repo.findUserByPhone(tx, input.phone);
        if (owner && owner.id !== target.id) throw errors.phoneTaken();
        values.phone = input.phone;
      }
      if (input.status !== undefined) {
        const next = nextStatus(target, input.status);
        if (next !== target.status) values.status = next;
      }
      if (
        values.status === 'disabled' &&
        target.role === 'admin' &&
        target.status === 'active' &&
        (await repo.countActiveAdmins(tx, target.id)) === 0
      ) {
        throw errors.conflict(LAST_ADMIN_MESSAGE);
      }
      const fields = Object.keys(values);
      if (fields.length === 0) return toUserListItem(target);

      await repo.updateUserFields(tx, target.id, values, now);
      await recordAudit(tx, {
        actorId: actor.userId,
        action: 'user.updated',
        targetType: 'user',
        targetId: target.id,
        data: { fields, targetRole: target.role },
        ip: meta.ip,
      });
      if (values.phone !== undefined) {
        // SEC-L7: never the numbers themselves.
        await recordAudit(tx, {
          actorId: actor.userId,
          action: 'user.phone_changed',
          targetType: 'user',
          targetId: target.id,
          data: { targetRole: target.role },
          ip: meta.ip,
        });
      }
      if (values.status !== undefined) {
        await recordAudit(tx, {
          actorId: actor.userId,
          action: values.status === 'disabled' ? 'user.disabled' : 'user.enabled',
          targetType: 'user',
          targetId: target.id,
          data: { from: target.status, to: values.status, targetRole: target.role },
          ip: meta.ip,
        });
      }
      if (values.status === 'disabled') {
        await revokeAllWithAudit(tx, actor, target.id, 'disabled', meta, now);
        await repo.revokeOpenTokens(tx, target.id, 'invite', now);
        await repo.revokeOpenTokens(tx, target.id, 'password_reset', now);
      } else if (values.phone !== undefined) {
        await revokeAllWithAudit(tx, actor, target.id, 'phone_changed', meta, now);
      }
      if (target.role === 'student' && (values.displayName || values.phone)) {
        await rebuildStudentSearchText(tx, target.id);
      }
      const updated = await repo.findUserById(tx, target.id);
      if (!updated) throw errors.notFound();
      logger.info(
        { event: 'user.updated', userId: actor.userId, targetId: target.id, fields },
        'user updated',
      );
      return toUserListItem(updated);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw errors.phoneTaken();
    throw err;
  }
}

/**
 * PATCH /users/:id/role (A; SEC-A4, SEC-S4, SEC-L6/L7). Staff roles only: a student never
 * changes role (409) and nobody becomes a student (422 in the schema). Demoting the last
 * active admin → 409. A real change revokes every session of the target and is audited as
 * `user.role_changed` (+ a warning log for the alert). Same role → 200 without changes.
 * The route asks for a recent password first (SEC-S7).
 */
export async function changeUserRole(
  actor: Actor,
  targetId: string,
  input: { role: 'admin' | 'mentor' },
  meta: RequestMeta,
  db: Db = getDb(),
): Promise<UserListItemDTO> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const target = await lockTargetForAdminEdit(tx, actor, targetId);
    if (target.role === 'student') throw errors.conflict('نقش هنرجو تغییر نمی‌کند.');
    if (target.role === input.role) return toUserListItem(target);
    if (
      target.role === 'admin' &&
      target.status === 'active' &&
      (await repo.countActiveAdmins(tx, target.id)) === 0
    ) {
      throw errors.conflict(LAST_ADMIN_MESSAGE);
    }
    await repo.updateUserFields(tx, target.id, { role: input.role }, now);
    await recordAudit(tx, {
      actorId: actor.userId,
      action: 'user.role_changed',
      targetType: 'user',
      targetId: target.id,
      data: { from: target.role, to: input.role },
      ip: meta.ip,
    });
    await revokeAllWithAudit(tx, actor, target.id, 'role_changed', meta, now);
    logger.warn(
      {
        event: 'user.role_changed',
        userId: actor.userId,
        targetId: target.id,
        from: target.role,
        to: input.role,
      },
      'user role changed',
    );
    const updated = await repo.findUserById(tx, target.id);
    if (!updated) throw errors.notFound();
    return toUserListItem(updated);
  });
}

// ---- re-authentication (SEC-S7, followup F-06) -------------------------------------------

export const REAUTH_PASSWORD_WRONG = 'رمز درست نیست.';

/**
 * POST /auth/reauth: the password of the signed-in user, again. A wrong password counts
 * toward the same lock as change-password (`pwchange:u:<id>`, 5 in 15 minutes), so the two
 * endpoints together never give more guesses. Success stamps `sessions.reauth_at`.
 */
export async function reauthenticate(
  actor: Actor,
  sessionId: string,
  input: { password: string },
  meta: RequestMeta,
  db: DbOrTx = getDb(),
): Promise<ReauthDTO> {
  const now = new Date();
  const key = throttleKeys.passwordChange(actor.userId);
  const states = await readThrottleStates(db, [key]);
  const retryAfter = lockRemainingSeconds(states.get(key), now);
  if (retryAfter > 0) throw errors.tooManyAttempts(retryAfter);

  const user = await repo.findUserById(db, actor.userId);
  if (user?.status !== 'active' || user.erasedAt) throw errors.unauthenticated();
  const cred = await repo.getCredentialsByPhone(db, user.phone);
  const ok = cred?.passwordHash ? await verifyPassword(cred.passwordHash, input.password) : false;
  if (!ok) {
    await registerFailure(db, key, THROTTLE_RULES.passwordChange, now);
    logger.info({ event: 'auth.reauth_failed', userId: actor.userId }, 'reauth failed');
    throw errors.validation({ password: REAUTH_PASSWORD_WRONG });
  }
  if (!(await repo.markSessionReauth(db, sessionId, now))) throw errors.unauthenticated();
  await clearThrottleKeys(db, [key]);
  await recordAudit(db, {
    actorId: actor.userId,
    action: 'session.reauth',
    targetType: 'user',
    targetId: actor.userId,
    ip: meta.ip,
  });
  logger.info({ event: 'auth.reauth', userId: actor.userId }, 'reauth succeeded');
  return { validUntil: new Date(now.getTime() + REAUTH_WINDOW_MS).toISOString() };
}

/**
 * SEC-S7: throws `403 REAUTH_REQUIRED` unless a password was entered on this session in the
 * last 30 minutes. Call it after the role check of the action (a mentor still gets 403).
 */
export function assertRecentPassword(lastPassword: Date, now: Date = new Date()): void {
  if (!isRecentlyAuthenticated(lastPassword, null, now)) throw errors.reauthRequired();
}

/** GET /mentors — admin and mentor. */
export async function listMentors(actor: Actor, db: DbOrTx = getDb()): Promise<MentorOptionDTO[]> {
  assertDecision(staffOnly(actor));
  const rows = await repo.listActiveStaff(db);
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    role: r.role as 'admin' | 'mentor',
  }));
}

/** Used by access.assertRefs: is this an active admin/mentor account? */
export async function isActiveStaffUser(db: DbOrTx, userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const user = await repo.findUserById(db, userId);
  return (
    user !== null &&
    user.status === 'active' &&
    user.erasedAt === null &&
    (user.role === 'admin' || user.role === 'mentor')
  );
}

/** Internal (CSV import dry run): is this normalised E.164 phone already used by a user? */
export async function isPhoneTaken(db: DbOrTx, phone: string): Promise<boolean> {
  return (await repo.findUserByPhone(db, phone)) !== null;
}

/** Internal (CSV import): the active admin/mentor with this normalised phone, if any. */
export async function findActiveStaffByPhone(
  db: DbOrTx,
  phone: string,
): Promise<{ id: string; displayName: string } | null> {
  const user = await repo.findUserByPhone(db, phone);
  if (user?.status !== 'active' || user.erasedAt) return null;
  if (user.role !== 'admin' && user.role !== 'mentor') return null;
  return { id: user.id, displayName: user.displayName };
}

// ---- CLI (server console only) ---------------------------------------------------------

export class CliError extends Error {}

/**
 * `pnpm admin:create` (ADR-0003 `admin:bootstrap`, SEC-T6, SEC-E3): only when no admin
 * exists yet. The 1-hour setup link is returned to the CLI, which prints it to stdout only.
 */
export async function bootstrapAdmin(
  input: { phone: string; displayName: string },
  db: Db = getDb(),
): Promise<{ userId: string; setupUrl: string; expiresAt: Date }> {
  return db.transaction(async (tx) => {
    // Serialise concurrent bootstrap runs.
    await tx.execute(sqlAdvisoryLock('identity.bootstrap_admin'));
    if ((await repo.countAdmins(tx)) > 0) {
      throw new CliError('An admin already exists. Use the web UI or `pnpm admin:reset-link`.');
    }
    const created = await createInvitedUser(
      tx,
      { role: 'admin', displayName: input.displayName, phone: input.phone, createdBy: null },
      { ttlMs: TOKEN_TTL.cli },
    );
    await recordAudit(tx, {
      actorId: null,
      action: 'user.bootstrap_admin',
      targetType: 'user',
      targetId: created.userId,
      data: { via: 'cli' },
    });
    return {
      userId: created.userId,
      setupUrl: linkFor('/invite', created.token),
      expiresAt: created.expiresAt,
    };
  });
}

/**
 * `pnpm admin:reset-link --phone …` (SEC-T7): 1-hour reset link for an active user (meant
 * for the only admin), clears every throttle key of that phone, audits with actor null.
 * For a user still in `invited` state (e.g. the bootstrap link expired) it issues a fresh
 * 1-hour invite link instead, so the first admin can never be locked out for good.
 */
export async function createCliResetLink(
  input: { phone: string },
  db: Db = getDb(),
): Promise<{
  userId: string;
  resetUrl: string;
  expiresAt: Date;
  purpose: 'invite' | 'password_reset';
}> {
  const phone = normalizeIranMobile(input.phone);
  if (!phone) throw new CliError('Invalid Iranian mobile number.');
  return db.transaction(async (tx) => {
    const user = await repo.findUserByPhone(tx, phone);
    if (!user || user.erasedAt) throw new CliError('No user with this phone.');
    if (user.status === 'disabled') {
      throw new CliError('User is disabled; re-enable the account before resetting the password.');
    }
    const purpose = user.status === 'invited' ? 'invite' : 'password_reset';
    const { token, expiresAt } = await issueToken(
      tx,
      user.id,
      purpose,
      TOKEN_TTL.cli,
      null,
      new Date(),
    );
    await clearThrottleForPhone(tx, phone);
    await recordAudit(tx, {
      actorId: null,
      action: purpose === 'invite' ? 'user.invite_link_created' : 'user.reset_link_created',
      targetType: 'user',
      targetId: user.id,
      data: { via: 'cli', targetRole: user.role },
    });
    const url = linkFor(purpose === 'invite' ? '/invite' : '/reset', token);
    return { userId: user.id, resetUrl: url, expiresAt, purpose };
  });
}

/**
 * `pnpm admin:erase-user` (ADR-0010, data-model.md 6-2): identity tables, audit_log,
 * students, profiles, stage history, tasks, submissions, reviews, extensions, notes,
 * timeline events, reminders, questions, check-ins, milestones, flags, health and
 * attachments. Staff are refused while primary mentor, reminder owner or question assignee.
 * Idempotent: a user that already has `erased_at` is left untouched.
 * Attachment files are deleted AFTER the commit; a failed delete leaves an anonymous,
 * ancient `pending` row that `files.cleanup` retries.
 */
export async function eraseUser(
  input: { userId: string; confirmDisplayName: string; requestedOn: string },
  db: Db = getDb(),
  storage?: FileStorage,
): Promise<'erased' | 'already_erased'> {
  if (!isUuid(input.userId)) throw new CliError('--id must be a UUID.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.requestedOn)) {
    throw new CliError('--requested-on must be YYYY-MM-DD.');
  }
  let attachmentIds: string[] = [];
  const outcome = await db.transaction(async (tx) => {
    const user = await repo.findUserById(tx, input.userId);
    if (!user) throw new CliError('No user with this id.');
    if (user.erasedAt) return 'already_erased' as const;
    if (normalizeFa(input.confirmDisplayName) !== user.displayName) {
      throw new CliError('--confirm does not match the current display name. Nothing was changed.');
    }
    if (
      user.role === 'admin' &&
      user.status === 'active' &&
      (await repo.countActiveAdmins(tx, user.id)) === 0
    ) {
      throw new CliError('This is the last active admin. Invite another admin first.');
    }
    if (user.role !== 'student' && (await countStudentsOfMentor(tx, user.id)) > 0) {
      throw new CliError(
        'This user is still the primary mentor of students. Move them first (PUT /students/:id/mentor).',
      );
    }
    if (user.role !== 'student' && (await countOpenRemindersOwnedBy(tx, user.id)) > 0) {
      throw new CliError(
        'This user still owns open reminders. Complete, cancel or reassign them first.',
      );
    }
    if (user.role !== 'student' && (await countOpenQuestionsAssignedTo(tx, user.id)) > 0) {
      throw new CliError(
        'This user is still the assignee of open questions. Reassign them first (PUT /questions/:id/assignee).',
      );
    }
    const now = new Date();
    let submissionIds: string[] = [];
    let sprint4: { questionMessageIds: string[]; milestoneIds: string[] } = {
      questionMessageIds: [],
      milestoneIds: [],
    };
    if (user.role === 'student') {
      // students, platform_profiles, profile_snapshots, mentor_assignments, stage_transitions
      await eraseStudentRecord(tx, user.id, now);
      await eraseTransitionNotes(tx, user.id);
      // tasks, submissions, reviews, task_extensions (sprint 3)
      submissionIds = await eraseTasksOfStudent(tx, user.id);
      // notes (hard delete), timeline_events (data = {}), reminders about them (sprint 3)
      await eraseTimelineOfStudent(tx, user.id);
      await eraseRemindersAboutStudent(tx, user.id, now);
      // question_threads/messages, checkins, milestones, student_flags, student_health (sprint 4)
      sprint4 = await eraseSprint4OfStudent(tx, user.id, now);
    }
    // Attachments of their submissions, question messages and milestones + their own pending
    // uploads (any role).
    attachmentIds = await detachForErasure(tx, user.id, { submissionIds, ...sprint4 });
    await repo.eraseUserRow(tx, user.id, now);
    await repo.deleteSessionsOfUser(tx, user.id);
    await repo.deleteTokensOfUser(tx, user.id);
    await clearThrottleForPhone(tx, user.phone);
    await clearThrottleKeys(tx, [throttleKeys.passwordChange(user.id)]);
    await anonymizeAuditForUser(tx, user.id, user.phone);
    await recordAudit(tx, {
      actorId: null,
      action: 'user.erased',
      targetType: 'user',
      targetId: user.id,
      data: { requestedOn: input.requestedOn, via: 'cli' },
    });
    return 'erased' as const;
  });
  if (outcome === 'erased' && attachmentIds.length > 0) {
    const result = await purgeAttachments(attachmentIds, db, storage ?? getStorage());
    if (result.failed > 0) {
      logger.error(
        { event: 'erase.files_pending', failed: result.failed },
        'some attachment files were not deleted; files.cleanup will retry',
      );
    }
  }
  return outcome;
}

// ---- retention job ---------------------------------------------------------------------

/** `auth.cleanup` (ADR-0007, data-model.md 6-1). Idempotent. */
export async function cleanupAuthData(now: Date = new Date(), db: DbOrTx = getDb()): Promise<void> {
  await repo.deleteStaleSessionsAndTokens(db, new Date(now.getTime() - 7 * DAY));
  await deleteStaleThrottleRows(db, now);
  await applyAuditRetention(db, now);
}

function sqlAdvisoryLock(name: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtext(${name}))`;
}
