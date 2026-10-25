import { updatePlatformInput } from '@/modules/catalog/contracts';
import { updatePlatform } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/platforms/:id — admin only. */
export const PATCH = route({
  auth: true,
  input: updatePlatformInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await updatePlatform(auth.actor, (params as { id: string }).id, input, meta)),
});
