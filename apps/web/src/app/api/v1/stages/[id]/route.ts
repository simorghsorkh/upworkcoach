import { updateStageInput } from '@/modules/catalog/contracts';
import { updateStage } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/stages/:id — admin only (deactivation: POST /stages/:id/deactivate). */
export const PATCH = route({
  auth: true,
  input: updateStageInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await updateStage(auth.actor, (params as { id: string }).id, input, meta)),
});
