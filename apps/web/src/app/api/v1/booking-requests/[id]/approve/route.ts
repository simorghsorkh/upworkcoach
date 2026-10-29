import { approveBooking } from '@/modules/scheduling/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/booking-requests/:id/approve — the request's mentor, A: books the session. */
export const POST = route({
  auth: true,
  handler: async ({ auth, params }) =>
    ok(await approveBooking(auth.actor, (params as { id: string }).id)),
});
