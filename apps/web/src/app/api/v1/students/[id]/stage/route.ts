import { changeStageInput } from '@/modules/path/contracts';
import { changeStage } from '@/modules/path/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/students/:id/stage — A, M in scope; note required for exception/regress. */
export const PUT = route({
  auth: true,
  input: changeStageInput,
  handler: async ({ auth, params, input }) =>
    ok(await changeStage(auth.actor, (params as { id: string }).id, input)),
});
