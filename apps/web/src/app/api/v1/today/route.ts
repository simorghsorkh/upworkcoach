import { todayQuery } from '@/modules/today/contracts';
import { getToday } from '@/modules/today/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/today — A, M: «امروز» in the actor's scope (A: `mentorId` filter). */
export const GET = route({
  auth: true,
  query: todayQuery,
  handler: async ({ auth, query }) => ok(await getToday(auth.actor, query)),
});
