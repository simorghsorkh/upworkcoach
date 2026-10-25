import { proposeMilestoneInput } from '@/modules/milestones/contracts';
import { listOwnMilestones, proposeOwnMilestone } from '@/modules/milestones/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/me/milestones — S: own approved and proposed ones. */
export const GET = route({
  auth: true,
  handler: async ({ auth }) => ok(await listOwnMilestones(auth.actor)),
});

/** POST /api/v1/me/milestones — S: a proposal with evidence (`status` → 422; T-ESC). */
export const POST = route({
  auth: true,
  input: proposeMilestoneInput,
  handler: async ({ auth, input }) => ({
    status: 201,
    body: await proposeOwnMilestone(auth.actor, input),
  }),
});
