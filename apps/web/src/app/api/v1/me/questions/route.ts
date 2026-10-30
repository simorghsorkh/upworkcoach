import { createQuestionInput, myQuestionsQuery } from '@/modules/questions/contracts';
import { createOwnQuestion, listOwnQuestions } from '@/modules/questions/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/me/questions — S: own threads + expected response time. */
export const GET = route({
  auth: true,
  query: myQuestionsQuery,
  handler: async ({ auth, query }) => ok(await listOwnQuestions(auth.actor, query)),
});

/** POST /api/v1/me/questions — S: a new thread (also "Deadline extension request" with `taskId`). */
export const POST = route({
  auth: true,
  input: createQuestionInput,
  handler: async ({ auth, input }) => ({
    status: 201,
    body: await createOwnQuestion(auth.actor, input),
  }),
});
