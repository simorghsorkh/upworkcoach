import { submitTaskInput } from '@/modules/tasks/contracts';
import { submitTask } from '@/modules/tasks/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/tasks/:id/submissions — S (own task): a new version (C4 attachments). */
export const POST = route({
  auth: true,
  input: submitTaskInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await submitTask(auth.actor, (params as { id: string }).id, input),
  }),
});
