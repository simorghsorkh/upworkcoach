import { updateReviewInput } from '@/modules/tasks/contracts';
import { updateReview } from '@/modules/tasks/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/reviews/:id — A; M = the reviewer, in scope (C3); within 24 h. */
export const PATCH = route({
  auth: true,
  input: updateReviewInput,
  handler: async ({ auth, params, input }) =>
    ok(await updateReview(auth.actor, (params as { id: string }).id, input)),
});
