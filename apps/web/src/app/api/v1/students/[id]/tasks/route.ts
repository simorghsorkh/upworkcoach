import { createTaskInput, studentTasksQuery } from '@/modules/tasks/contracts';
import { createTask, listStudentTasks } from '@/modules/tasks/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/tasks — A, M in scope; `status` (list or `all`), `stageId`. */
export const GET = route({
  auth: true,
  query: studentTasksQuery,
  handler: async ({ auth, params, query }) =>
    ok(await listStudentTasks(auth.actor, (params as { id: string }).id, query)),
});

/** POST /api/v1/students/:id/tasks — A, M in scope (C3: profileId of this student). */
export const POST = route({
  auth: true,
  input: createTaskInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await createTask(auth.actor, (params as { id: string }).id, input),
  }),
});
