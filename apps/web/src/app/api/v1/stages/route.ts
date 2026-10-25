import { catalogListQuery, createStageInput } from '@/modules/catalog/contracts';
import { createStage, listStages } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/stages — any signed-in user; `?includeInactive=1` for admins. */
export const GET = route({
  auth: true,
  query: catalogListQuery,
  handler: async ({ auth, query }) => ok(await listStages(auth.actor, query)),
});

/** POST /api/v1/stages — admin only. */
export const POST = route({
  auth: true,
  input: createStageInput,
  handler: async ({ auth, input, meta }) => ({
    status: 201,
    body: await createStage(auth.actor, input, meta),
  }),
});
