import { nodeCompletionInput } from '@/modules/programs/contracts';
import { setNodeCompletion } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/**
 * PUT /api/v1/enrollments/:id/nodes/:nodeId/completion — mark an activity done or undo it;
 * the mentee for their own enrollment, staff for one they reach (Coach Office sprint 5).
 */
export const PUT = route({
  auth: true,
  input: nodeCompletionInput,
  handler: async ({ auth, params, input }) => {
    const { id, nodeId } = params as { id: string; nodeId: string };
    return ok(await setNodeCompletion(auth.actor, id, nodeId, input));
  },
});
