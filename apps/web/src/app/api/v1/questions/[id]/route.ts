import { getQuestion } from '@/modules/questions/service';
import { ok, route } from '@/server/http/handler';

/**
 * GET /api/v1/questions/:id — A, M (scope, or assignee while open); S own. The DTO is chosen
 * by role (SEC-A5): staff get the record summary, the student never does.
 */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await getQuestion(auth.actor, params.id)),
});
