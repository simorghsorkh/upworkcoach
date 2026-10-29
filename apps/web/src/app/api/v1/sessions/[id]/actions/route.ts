import { sessionActionInput } from '@/modules/mentoring/contracts';
import { addSessionAction } from '@/modules/mentoring/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/sessions/:id/actions — a session's next action, as a task (sprint 5b). */
export const POST = route({
  auth: true,
  input: sessionActionInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await addSessionAction(auth.actor, (params as { id: string }).id, input),
  }),
});
