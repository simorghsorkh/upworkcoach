import { enrollInput } from '@/modules/programs/contracts';
import { enroll } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/program-runs/:id/enrollments — mentees of the caller's scope join the run. */
export const POST = route({
  auth: true,
  input: enrollInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await enroll(auth.actor, (params as { id: string }).id, input, meta)),
});
