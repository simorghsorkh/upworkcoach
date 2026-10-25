import { changeMentorInput } from '@/modules/students/contracts';
import { changeMentor } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/students/:id/mentor — admin only; `mentorId: null` = unassigned. */
export const PUT = route({
  auth: true,
  input: changeMentorInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await changeMentor(auth.actor, (params as { id: string }).id, input, meta)),
});
