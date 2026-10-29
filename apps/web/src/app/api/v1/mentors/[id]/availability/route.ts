import { availabilityInput } from '@/modules/scheduling/contracts';
import { getAvailability, setAvailability } from '@/modules/scheduling/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/mentors/:id/availability — A; M for themselves: hours, exceptions, offerings. */
export const GET = route({
  auth: true,
  handler: async ({ auth, params }) =>
    ok(await getAvailability(auth.actor, (params as { id: string }).id)),
});

/** PUT /api/v1/mentors/:id/availability — A; M for themselves: replaces hours and exceptions. */
export const PUT = route({
  auth: true,
  input: availabilityInput,
  handler: async ({ auth, params, input }) =>
    ok(await setAvailability(auth.actor, (params as { id: string }).id, input)),
});
