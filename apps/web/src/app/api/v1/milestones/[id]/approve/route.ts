import { approveMilestone } from '@/modules/milestones/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/milestones/:id/approve — A, M in scope; second approval of a unique type → 409. */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await approveMilestone(auth.actor, params.id)),
});
