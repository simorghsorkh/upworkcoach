import { addStaffInput } from '@/modules/programs/contracts';
import { addStaff } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/program-runs/:id/staff — A or the run's manager. */
export const POST = route({
  auth: true,
  input: addStaffInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await addStaff(auth.actor, (params as { id: string }).id, input, meta)),
});
