import { listMentors } from '@/modules/identity/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/mentors — admin and mentor: active staff for pickers and filters. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await listMentors(auth.actor)),
});
