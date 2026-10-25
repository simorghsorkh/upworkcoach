import { lifecycleInput } from '@/modules/students/contracts';
import { setLifecycle } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/students/:id/lifecycle — A, M in scope. */
export const PUT = route({
  auth: true,
  input: lifecycleInput,
  handler: async ({ auth, params, input }) =>
    ok(await setLifecycle(auth.actor, (params as { id: string }).id, input)),
});
