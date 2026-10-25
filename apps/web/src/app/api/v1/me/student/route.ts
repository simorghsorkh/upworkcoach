import { updateOwnStudentInput } from '@/modules/students/contracts';
import { getOwnStudent, updateOwnStudent } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/me/student — student only: SelfStudentDTO (no internal fields). */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await getOwnStudent(auth.actor)),
});

/** PATCH /api/v1/me/student — student only; whitelist fields (anything else → 422). */
export const PATCH = route({
  auth: true,
  input: updateOwnStudentInput,
  handler: async ({ auth, input }) => ok(await updateOwnStudent(auth.actor, input)),
});
