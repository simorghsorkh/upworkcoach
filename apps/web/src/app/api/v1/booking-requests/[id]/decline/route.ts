import { declineBookingInput } from '@/modules/scheduling/contracts';
import { declineBooking } from '@/modules/scheduling/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/booking-requests/:id/decline — the request's mentor, A: frees the slot. */
export const POST = route({
  auth: true,
  input: declineBookingInput,
  handler: async ({ auth, params, input }) =>
    ok(await declineBooking(auth.actor, (params as { id: string }).id, input.reason ?? null)),
});
