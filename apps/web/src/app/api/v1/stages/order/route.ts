import { reorderStagesInput } from '@/modules/catalog/contracts';
import { reorderStages } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** PUT /api/v1/stages/order — admin only; the full set of stage ids in the new order. */
export const PUT = route({
  auth: true,
  input: reorderStagesInput,
  handler: async ({ auth, input, meta }) => ok(await reorderStages(auth.actor, input, meta)),
});
