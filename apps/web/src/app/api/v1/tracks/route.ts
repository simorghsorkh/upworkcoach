import { catalogListQuery } from '@/modules/catalog/contracts';
import { listTracks } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/tracks — any signed-in user; `?includeInactive=1` for admins. */
export const GET = route({
  auth: true,
  query: catalogListQuery,
  handler: async ({ auth, query }) => ok(await listTracks(auth.actor, query)),
});
