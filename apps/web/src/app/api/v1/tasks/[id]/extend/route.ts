import { extendTaskInput } from '@/modules/tasks/contracts';
import { extendTask } from '@/modules/tasks/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/tasks/:id/extend — A, M in scope: a later deadline + reason. */
export const POST = route({
  auth: true,
  input: extendTaskInput,
  handler: async ({ auth, params, input }) =>
    ok(await extendTask(auth.actor, (params as { id: string }).id, input)),
});
