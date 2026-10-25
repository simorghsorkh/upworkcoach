import { postMessageInput } from '@/modules/questions/contracts';
import { postMessage } from '@/modules/questions/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/questions/:id/messages — A, M (scope or assignee), S own. */
export const POST = route({
  auth: true,
  input: postMessageInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await postMessage(auth.actor, (params as { id: string }).id, input),
  }),
});
