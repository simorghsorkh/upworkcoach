import { createFlagInput, listFlagsQuery } from '@/modules/health/contracts';
import { createFlag, listFlags } from '@/modules/health/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/flags — A, M in scope; `active=1` for active ones only. */
export const GET = route({
  auth: true,
  query: listFlagsQuery,
  handler: async ({ auth, params, query }) =>
    ok(await listFlags(auth.actor, (params as { id: string }).id, query)),
});

/** POST /api/v1/students/:id/flags — A, M in scope (R-FLAG); health is recomputed. */
export const POST = route({
  auth: true,
  input: createFlagInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await createFlag(auth.actor, (params as { id: string }).id, input),
  }),
});
