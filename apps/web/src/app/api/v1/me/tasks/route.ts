import { myTasksQuery } from '@/modules/tasks/contracts';
import { listOwnTasks } from '@/modules/tasks/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/me/tasks — S: own tasks, overdue first then by deadline (student DTO). */
export const GET = route({
  auth: true,
  query: myTasksQuery,
  handler: async ({ auth, query }) => ok(await listOwnTasks(auth.actor, query)),
});
