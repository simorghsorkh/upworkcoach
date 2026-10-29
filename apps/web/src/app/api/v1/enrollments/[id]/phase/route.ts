import { changePhaseInput } from '@/modules/programs/contracts';
import { changeEnrollmentPhase } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/enrollments/:id/phase — same rules as a stage change; note for back/exception. */
export const PUT = route({
  auth: true,
  input: changePhaseInput,
  handler: async ({ auth, params, input }) =>
    ok(await changeEnrollmentPhase(auth.actor, (params as { id: string }).id, input)),
});
