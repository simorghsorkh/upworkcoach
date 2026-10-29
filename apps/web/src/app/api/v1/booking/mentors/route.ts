import { listBookableMentors } from '@/modules/scheduling/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/booking/mentors — S: mentors taking bookings, with offerings and packages. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await listBookableMentors(auth.actor)),
});
