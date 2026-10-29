import { slotsQuery } from '@/modules/scheduling/contracts';
import { getSlots } from '@/modules/scheduling/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/mentors/:id/slots?templateId= — free slots of an active offering (sprint 7). */
export const GET = route({
  auth: true,
  query: slotsQuery,
  handler: async ({ auth, params, query }) =>
    ok(await getSlots(auth.actor, (params as { id: string }).id, query.templateId)),
});
