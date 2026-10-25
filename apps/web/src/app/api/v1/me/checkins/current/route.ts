import { getCurrentCheckin } from '@/modules/checkins/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/me/checkins/current — S (404 while the check-in is off). */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await getCurrentCheckin(auth.actor)),
});
