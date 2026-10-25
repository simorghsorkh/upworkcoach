import { updateMilestoneTypeInput } from '@/modules/catalog/contracts';
import { updateMilestoneType } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/milestone-types/:id — A. */
export const PATCH = route({
  auth: true,
  input: updateMilestoneTypeInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await updateMilestoneType(auth.actor, (params as { id: string }).id, input, meta)),
});
