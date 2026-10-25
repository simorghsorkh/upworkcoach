import { listOwnSessions } from '@/modules/identity/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/auth/sessions — the signed-in user's own devices. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await listOwnSessions(auth.actor, auth.sessionId)),
});
