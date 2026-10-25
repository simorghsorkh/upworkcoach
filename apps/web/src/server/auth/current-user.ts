// Shared contract between backend (implements) and frontend (imports).
// Shapes follow docs/04-architecture/api.md (MeDTO) and ADR-0004 (actor).
// backend-engineer replaces the stub bodies; do not change the signatures
// without updating every importer.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { authenticateSession } from '@/modules/identity/service';
import { getCookieConfig } from './cookies';

export type Role = 'admin' | 'mentor' | 'student';

/** First parameter of every service function (ADR-0004). */
export type Actor = { userId: string; role: Role };

/** GET /api/v1/auth/me */
export type MeDTO = {
  id: string;
  displayName: string;
  role: Role;
  phone: string;
};

// One session lookup per server request, however many components ask (React cache).
// Validation is the same as for the API (ADR-0003 section 5, SEC-S3): status, expiry,
// password change and role are read from the database on every request.
const loadCurrentUser = cache(async (): Promise<MeDTO | null> => {
  const store = await cookies();
  const token = store.get(getCookieConfig().sessionName)?.value;
  if (!token) return null;
  // RSC cannot set cookies; the sliding expiry is extended in the database only. The cookie
  // itself lives until the session's absolute cap (see sprint-1 notes).
  const session = await authenticateSession(token, { touch: true });
  return session?.user ?? null;
});

/** Current signed-in user from the session cookie, or null. For RSC layouts and pages. */
export async function getCurrentUser(): Promise<MeDTO | null> {
  return loadCurrentUser();
}

/** Home page of each role: staff → /today, student → /home. */
function homeOf(role: Role): string {
  return role === 'student' ? '/home' : '/today';
}

/** Like getCurrentUser, but redirects to /login when signed out and to the
 * role's home when the role is not allowed. */
export async function requireUser(_allowed: readonly Role[]): Promise<MeDTO> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!_allowed.includes(user.role)) redirect(homeOf(user.role));
  return user;
}

export function toActor(user: MeDTO): Actor {
  return { userId: user.id, role: user.role };
}
