import { deactivateStage } from '@/modules/path/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/stages/:id/deactivate — admin only; 409 while active students are in it. */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params, meta }) => ok(await deactivateStage(auth.actor, params.id, meta)),
});
