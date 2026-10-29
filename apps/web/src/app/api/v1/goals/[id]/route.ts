import { updateGoalInput } from '@/modules/mentoring/contracts';
import { updateGoal } from '@/modules/mentoring/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/goals/:id — A, M: edit, or mark achieved, dropped or open (sprint 5b). */
export const PATCH = route({
  auth: true,
  input: updateGoalInput,
  handler: async ({ auth, params, input }) =>
    ok(await updateGoal(auth.actor, (params as { id: string }).id, input)),
});
