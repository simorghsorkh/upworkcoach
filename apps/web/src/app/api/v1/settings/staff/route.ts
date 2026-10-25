import { getStaffSettings } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/settings/staff — A, M: read-only view (mentorsCanInviteStudents, SLA, …). */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await getStaffSettings(auth.actor)),
});
