import { rejectMilestoneInput } from '@/modules/milestones/contracts';
import { rejectMilestone } from '@/modules/milestones/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/milestones/:id/reject — A, M in scope. */
export const POST = route({
  auth: true,
  input: rejectMilestoneInput,
  handler: async ({ auth, params, input }) =>
    ok(await rejectMilestone(auth.actor, (params as { id: string }).id, input)),
});
