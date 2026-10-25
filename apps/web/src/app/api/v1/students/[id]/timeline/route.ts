import { timelineQuery } from '@/modules/timeline/contracts';
import { getTimeline } from '@/modules/timeline/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/timeline — A, M in scope; `types` = categories, cursor. */
export const GET = route({
  auth: true,
  query: timelineQuery,
  handler: async ({ auth, params, query }) =>
    ok(await getTimeline(auth.actor, (params as { id: string }).id, query)),
});
