import { createGoalInput } from '@/modules/mentoring/contracts';
import { createGoal, listGoals } from '@/modules/mentoring/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/enrollments/:id/goals — staff who may act on it, or the mentee (sprint 5b). */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await listGoals(auth.actor, params.id)),
});

/** POST /api/v1/enrollments/:id/goals — A, M: a goal of one-on-one mentoring. */
export const POST = route({
  auth: true,
  input: createGoalInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await createGoal(auth.actor, (params as { id: string }).id, input),
  }),
});
