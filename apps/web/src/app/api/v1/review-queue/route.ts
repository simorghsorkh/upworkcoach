import { reviewQueueQuery } from '@/modules/tasks/contracts';
import { getReviewQueue } from '@/modules/tasks/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/review-queue — A, M: submitted tasks in scope with the review SLA. */
export const GET = route({
  auth: true,
  query: reviewQueueQuery,
  handler: async ({ auth, query }) => ok(await getReviewQueue(auth.actor, query)),
});
