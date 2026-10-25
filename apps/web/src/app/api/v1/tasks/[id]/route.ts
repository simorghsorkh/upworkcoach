import { updateTaskInput } from '@/modules/tasks/contracts';
import { getTask, updateTask } from '@/modules/tasks/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/tasks/:id — A, M in scope (staff DTO); S own task (student DTO). */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await getTask(auth.actor, params.id)),
});

/** PATCH /api/v1/tasks/:id — A, M in scope. The deadline changes only through /extend. */
export const PATCH = route({
  auth: true,
  input: updateTaskInput,
  handler: async ({ auth, params, input }) =>
    ok(await updateTask(auth.actor, (params as { id: string }).id, input)),
});
