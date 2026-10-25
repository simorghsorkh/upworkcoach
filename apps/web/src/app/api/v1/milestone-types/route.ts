import { catalogListQuery, createMilestoneTypeInput } from '@/modules/catalog/contracts';
import { createMilestoneType, listMilestoneTypes } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/milestone-types — every role (inactive ones: admin with `includeInactive`). */
export const GET = route({
  auth: true,
  query: catalogListQuery,
  handler: async ({ auth, query }) => ok(await listMilestoneTypes(auth.actor, query)),
});

/** POST /api/v1/milestone-types — A. */
export const POST = route({
  auth: true,
  input: createMilestoneTypeInput,
  handler: async ({ auth, input, meta }) => ({
    status: 201,
    body: await createMilestoneType(auth.actor, input, meta),
  }),
});
