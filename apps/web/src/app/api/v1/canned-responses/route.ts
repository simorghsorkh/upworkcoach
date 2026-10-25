import { catalogListQuery, createCannedResponseInput } from '@/modules/catalog/contracts';
import { createCannedResponse, listCannedResponses } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/canned-responses — A, M (inactive ones: admin with `includeInactive`). */
export const GET = route({
  auth: true,
  query: catalogListQuery,
  handler: async ({ auth, query }) => ok(await listCannedResponses(auth.actor, query)),
});

/** POST /api/v1/canned-responses — A. */
export const POST = route({
  auth: true,
  input: createCannedResponseInput,
  handler: async ({ auth, input, meta }) => ({
    status: 201,
    body: await createCannedResponse(auth.actor, input, meta),
  }),
});
