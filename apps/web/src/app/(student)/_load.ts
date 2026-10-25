import { getOwnPath } from '@/modules/path/service';
import { getOwnStudent } from '@/modules/students/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';

/** The signed-in student's own record and path; `null` when the record does not exist (404). */
export async function loadOwn() {
  const user = await requireUser(['student']);
  const actor = toActor(user);
  try {
    const [student, path] = await Promise.all([getOwnStudent(actor), getOwnPath(actor)]);
    return { user, actor, student, path };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { user, actor, student: null, path: null };
    }
    throw err;
  }
}
