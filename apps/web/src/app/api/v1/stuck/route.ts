import { stuckQuery } from '@/modules/health/contracts';
import { listStuckStudents } from '@/modules/health/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/stuck — A, M: yellow and red students of the scope (F7). */
export const GET = route({
  auth: true,
  query: stuckQuery,
  handler: async ({ auth, query }) => ok(await listStuckStudents(auth.actor, query)),
});
