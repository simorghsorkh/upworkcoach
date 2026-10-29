import { updateEnrollmentInput } from '@/modules/programs/contracts';
import { updateEnrollment } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/enrollments/:id — pause, resume, complete or drop. */
export const PATCH = route({
  auth: true,
  input: updateEnrollmentInput,
  handler: async ({ auth, params, input }) =>
    ok(await updateEnrollment(auth.actor, (params as { id: string }).id, input)),
});
