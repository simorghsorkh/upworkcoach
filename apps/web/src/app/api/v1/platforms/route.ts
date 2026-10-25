import { catalogListQuery, createPlatformInput } from '@/modules/catalog/contracts';
import { createPlatform, listPlatforms } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/platforms — any signed-in user; `?includeInactive=1` for admins. */
export const GET = route({
  auth: true,
  query: catalogListQuery,
  handler: async ({ auth, query }) => ok(await listPlatforms(auth.actor, query)),
});

/** POST /api/v1/platforms — admin only (new platform without a code change, F2). */
export const POST = route({
  auth: true,
  input: createPlatformInput,
  handler: async ({ auth, input, meta }) => ({
    status: 201,
    body: await createPlatform(auth.actor, input, meta),
  }),
});
