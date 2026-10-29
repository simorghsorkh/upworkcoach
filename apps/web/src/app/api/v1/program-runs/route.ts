import { createRunInput, runListQuery } from '@/modules/programs/contracts';
import { createRun, listRuns } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/program-runs — A: all; M: runs they staff or with their mentees. */
export const GET = route({
  auth: true,
  query: runListQuery,
  handler: async ({ auth, query }) => ok(await listRuns(auth.actor, query)),
});

/** POST /api/v1/program-runs — from a template (snapshot) or a one-on-one without one. */
export const POST = route({
  auth: true,
  input: createRunInput,
  handler: async ({ auth, input, meta }) => ({
    status: 201,
    body: await createRun(auth.actor, input, meta),
  }),
});
