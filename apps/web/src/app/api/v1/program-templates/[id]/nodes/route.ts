import { createNodeInput } from '@/modules/programs/contracts';
import { createNode } from '@/modules/programs/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/program-templates/:id/nodes — a phase, or an activity inside a phase. */
export const POST = route({
  auth: true,
  input: createNodeInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await createNode(auth.actor, (params as { id: string }).id, input),
  }),
});
