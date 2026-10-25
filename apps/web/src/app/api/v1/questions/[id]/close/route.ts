import { closeQuestion } from '@/modules/questions/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/questions/:id/close — A, M (scope or assignee), S own. */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await closeQuestion(auth.actor, params.id)),
});
