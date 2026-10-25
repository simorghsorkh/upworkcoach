import { northStarQuery } from '@/modules/milestones/contracts';
import { getNorthStar } from '@/modules/milestones/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/dashboard/north-star — A (default range: current Jalali month). */
export const GET = route({
  auth: true,
  query: northStarQuery,
  handler: async ({ auth, query }) => ok(await getNorthStar(auth.actor, query)),
});
