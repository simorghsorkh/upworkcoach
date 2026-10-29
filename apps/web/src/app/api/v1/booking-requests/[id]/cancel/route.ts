import { cancelBooking } from '@/modules/scheduling/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/booking-requests/:id/cancel — S (own): until the offering's cancel notice. */
export const POST = route({
  auth: true,
  handler: async ({ auth, params }) =>
    ok(await cancelBooking(auth.actor, (params as { id: string }).id)),
});
