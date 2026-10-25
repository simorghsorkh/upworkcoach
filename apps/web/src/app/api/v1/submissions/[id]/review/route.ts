import { reviewInput } from '@/modules/tasks/contracts';
import { reviewSubmission } from '@/modules/tasks/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/submissions/:id/review — A, M in scope; latest version of a submitted task. */
export const POST = route({
  auth: true,
  input: reviewInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await reviewSubmission(auth.actor, (params as { id: string }).id, input),
  }),
});
