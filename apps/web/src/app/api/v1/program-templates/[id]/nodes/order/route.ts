import { reorderNodesInput } from '@/modules/programs/contracts';
import { reorderNodes } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/program-templates/:id/nodes/order — every sibling of one level, in order. */
export const PUT = route({
  auth: true,
  input: reorderNodesInput,
  handler: async ({ auth, params, input }) =>
    ok(await reorderNodes(auth.actor, (params as { id: string }).id, input)),
});
