import { updateRunInput } from '@/modules/programs/contracts';
import { getRun, updateRun } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/program-runs/:id — phases, staff and the enrollments the caller may see. */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await getRun(auth.actor, params.id)),
});

/** PATCH /api/v1/program-runs/:id — title, dates, status. */
export const PATCH = route({
  auth: true,
  input: updateRunInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await updateRun(auth.actor, (params as { id: string }).id, input, meta)),
});
