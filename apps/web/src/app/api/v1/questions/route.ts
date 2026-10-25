import { listQuestionsQuery } from '@/modules/questions/contracts';
import { listQuestions } from '@/modules/questions/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/questions — A, M: scope OR assigned to me (open/answered). */
export const GET = route({
  auth: true,
  query: listQuestionsQuery,
  handler: async ({ auth, query }) => ok(await listQuestions(auth.actor, query)),
});
