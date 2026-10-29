import { bookingListQuery, createBookingInput } from '@/modules/scheduling/contracts';
import { createBooking, listBookings } from '@/modules/scheduling/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/booking-requests — S: own; M: theirs; A: all (`status=open` by default for staff). */
export const GET = route({
  auth: true,
  query: bookingListQuery,
  handler: async ({ auth, query }) => ok(await listBookings(auth.actor, query)),
});

/** POST /api/v1/booking-requests — S: request a free slot; the mentor approves it. */
export const POST = route({
  auth: true,
  input: createBookingInput,
  handler: async ({ auth, input }) => ({
    status: 201,
    body: await createBooking(auth.actor, input),
  }),
});
