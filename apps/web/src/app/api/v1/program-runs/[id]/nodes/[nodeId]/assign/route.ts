import { assignNodeInput } from '@/modules/programs/contracts';
import { assignNodeToRun } from '@/modules/programs/service';
import { route } from '@/server/http/handler';

/**
 * POST /api/v1/program-runs/:id/nodes/:nodeId/assign — a task from an assignment activity for
 * every active member of the run who has none yet (Coach Office sprint 5).
 */
export const POST = route({
  auth: true,
  input: assignNodeInput,
  handler: async ({ auth, params, input, meta }) => {
    const { id, nodeId } = params as { id: string; nodeId: string };
    return { status: 201, body: await assignNodeToRun(auth.actor, id, nodeId, input, meta) };
  },
});
