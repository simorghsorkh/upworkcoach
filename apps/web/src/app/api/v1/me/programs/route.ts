import { getMyPrograms } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/me/programs — mentee: their programs with each phase's state. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await getMyPrograms(auth.actor)),
});
