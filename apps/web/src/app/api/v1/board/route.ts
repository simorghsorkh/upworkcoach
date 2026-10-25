import { boardQuery } from '@/modules/path/contracts';
import { getBoard } from '@/modules/path/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/board — A, M (scope): kanban columns per stage with days in stage. */
export const GET = route({
  auth: true,
  query: boardQuery,
  handler: async ({ auth, query }) => ok(await getBoard(auth.actor, query)),
});
