import { getOwnPath } from '@/modules/path/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/me/path — student only: stages with passed/current/locked, current, next. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await getOwnPath(auth.actor)),
});
