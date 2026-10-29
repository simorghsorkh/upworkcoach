import { updateSessionInput } from '@/modules/mentoring/contracts';
import { updateSession } from '@/modules/mentoring/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/sessions/:id — reschedule or record held, no-show or cancelled (sprint 5b). */
export const PATCH = route({
  auth: true,
  input: updateSessionInput,
  handler: async ({ auth, params, input }) =>
    ok(await updateSession(auth.actor, (params as { id: string }).id, input)),
});
