import { updateCannedResponseInput } from '@/modules/catalog/contracts';
import { updateCannedResponse } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/canned-responses/:id — A. */
export const PATCH = route({
  auth: true,
  input: updateCannedResponseInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await updateCannedResponse(auth.actor, (params as { id: string }).id, input, meta)),
});
