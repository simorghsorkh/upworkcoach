import { cancelTaskInput } from '@/modules/tasks/contracts';
import { cancelTask } from '@/modules/tasks/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/tasks/:id/cancel — A, M in scope; 409 INVALID_TRANSITION when final. */
export const POST = route({
  auth: true,
  input: cancelTaskInput,
  handler: async ({ auth, params, input }) =>
    ok(await cancelTask(auth.actor, (params as { id: string }).id, input)),
});
