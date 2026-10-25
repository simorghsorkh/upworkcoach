import { listCheckinsQuery } from '@/modules/checkins/contracts';
import { listStudentCheckins } from '@/modules/checkins/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/checkins — A, M in scope (404 while the check-in is off). */
export const GET = route({
  auth: true,
  query: listCheckinsQuery,
  handler: async ({ auth, params, query }) =>
    ok(await listStudentCheckins(auth.actor, (params as { id: string }).id, query)),
});
