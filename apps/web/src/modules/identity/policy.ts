import type { Actor, Role } from '@/server/auth/current-user';

/**
 * identity — access rules (ADR-0004 section 2, security.md SEC-A4 / C3). Pure functions.
 *
 * Outcomes map to HTTP: forbidden → 403 (role may never call the endpoint),
 * not_found → 404 (target hidden from this actor), conflict → 409 (wrong target state).
 */
export type Decision = 'ok' | 'forbidden' | 'not_found' | 'conflict';

export type TargetUser = {
  role: Role;
  status: 'invited' | 'active' | 'disabled';
  erasedAt: Date | null;
};

export const isStaff = (role: Role) => role === 'admin' || role === 'mentor';

/** POST /invitations (mentor or admin accounts) and GET /users, reset-link: admin only. */
export function adminOnly(actor: Actor): Decision {
  return actor.role === 'admin' ? 'ok' : 'forbidden';
}

/** GET /mentors: admin and mentor. */
export function staffOnly(actor: Actor): Decision {
  return isStaff(actor.role) ? 'ok' : 'forbidden';
}

/**
 * POST /users/:id/invite-link.
 * - admin: any invited user; erased or not invited → 409.
 * - mentor (C3): only when the target is explicitly `role = 'student'`, `status = 'invited'`,
 *   not erased, and in the mentor's scope. Anything else — including an invited admin or
 *   mentor — is 404, so a mentor cannot even learn that such a user exists.
 * - student: 403.
 */
export function inviteLinkDecision(
  actor: Actor,
  target: TargetUser | null,
  targetInMentorScope: boolean,
): Decision {
  if (actor.role === 'student') return 'forbidden';
  if (!target) return 'not_found';
  if (actor.role === 'admin') {
    if (target.erasedAt !== null) return 'conflict';
    return target.status === 'invited' ? 'ok' : 'conflict';
  }
  // mentor
  if (target.role !== 'student') return 'not_found';
  if (target.status !== 'invited' || target.erasedAt !== null) return 'not_found';
  return targetInMentorScope ? 'ok' : 'not_found';
}

/**
 * POST /users/:id/reset-link — admin only. Only for active, non-erased users (an invited user
 * needs an invite link; a disabled user must be re-enabled first).
 */
export function resetLinkDecision(actor: Actor, target: TargetUser | null): Decision {
  if (actor.role !== 'admin') return 'forbidden';
  if (!target) return 'not_found';
  if (target.erasedAt !== null) return 'conflict';
  return target.status === 'active' ? 'ok' : 'conflict';
}
