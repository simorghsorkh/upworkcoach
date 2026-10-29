import { markNotificationsReadInput } from '@/modules/notifications/contracts';
import { markNotificationsRead } from '@/modules/notifications/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/notifications/read — A, M, S: mark the given ids (or all) as read. */
export const POST = route({
  auth: true,
  input: markNotificationsReadInput,
  handler: async ({ auth, input }) => ok(await markNotificationsRead(auth.actor, input)),
});
