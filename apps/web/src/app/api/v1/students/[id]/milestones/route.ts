import { createMilestoneInput } from '@/modules/milestones/contracts';
import { createStudentMilestone, listStudentMilestones } from '@/modules/milestones/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/milestones — A, M in scope. */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await listStudentMilestones(auth.actor, params.id)),
});

/** POST /api/v1/students/:id/milestones — A, M in scope: recorded as approved. */
export const POST = route({
  auth: true,
  input: createMilestoneInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await createStudentMilestone(auth.actor, (params as { id: string }).id, input),
  }),
});
