import { changeAssigneeInput } from '@/modules/questions/contracts';
import { changeAssignee } from '@/modules/questions/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/questions/:id/assignee — A: an active admin or mentor (C3). */
export const PUT = route({
  auth: true,
  input: changeAssigneeInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await changeAssignee(auth.actor, (params as { id: string }).id, input, meta)),
});
