import { updateNodeInput } from '@/modules/programs/contracts';
import { deleteNode, updateNode } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

type Params = { id: string; nodeId: string };

/** PATCH /api/v1/program-templates/:id/nodes/:nodeId */
export const PATCH = route({
  auth: true,
  input: updateNodeInput,
  handler: async ({ auth, params, input }) => {
    const { id, nodeId } = params as Params;
    return ok(await updateNode(auth.actor, id, nodeId, input));
  },
});

/** DELETE /api/v1/program-templates/:id/nodes/:nodeId — a phase goes with its activities. */
export const DELETE = route<Params>({
  auth: true,
  handler: async ({ auth, params }) => ok(await deleteNode(auth.actor, params.id, params.nodeId)),
});
