import { updateStudentInput } from '@/modules/students/contracts';
import { getStudent, updateStudent } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id — A, M in scope (404 otherwise). */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await getStudent(auth.actor, params.id)),
});

/** PATCH /api/v1/students/:id — A, M in scope; `ifUpdatedAt` → 409 on a concurrent edit. */
export const PATCH = route({
  auth: true,
  input: updateStudentInput,
  handler: async ({ auth, params, input }) =>
    ok(await updateStudent(auth.actor, (params as { id: string }).id, input)),
});
