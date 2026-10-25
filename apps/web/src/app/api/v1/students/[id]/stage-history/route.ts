import { getStageHistory } from '@/modules/path/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/stage-history — A, M in scope; oldest first. */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await getStageHistory(auth.actor, params.id)),
});
