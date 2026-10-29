import { getOrgDashboard } from '@/modules/dashboard/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/dashboard/organization — A (Coach Office sprint 6). */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await getOrgDashboard(auth.actor)),
});
