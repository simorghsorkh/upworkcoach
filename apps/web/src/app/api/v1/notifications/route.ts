import { listNotificationsQuery } from '@/modules/notifications/contracts';
import { listNotifications } from '@/modules/notifications/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/notifications — A, M, S: the caller's own notices (Coach Office sprint 6b). */
export const GET = route({
  auth: true,
  query: listNotificationsQuery,
  handler: async ({ auth, query }) => ok(await listNotifications(auth.actor, query)),
});
