import { bulkTasksInput } from '@/modules/tasks/contracts';
import { createTasksInBulk } from '@/modules/tasks/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/tasks/bulk — A, M; every student in scope or nothing is created (C3). */
export const POST = route({
  auth: true,
  input: bulkTasksInput,
  handler: async ({ auth, input }) => ({
    status: 201,
    body: await createTasksInBulk(auth.actor, input),
  }),
});
