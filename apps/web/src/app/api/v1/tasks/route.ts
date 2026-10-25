import { staffTasksQuery } from '@/modules/tasks/contracts';
import { listStaffTasks } from '@/modules/tasks/service';
import { ok, route } from '@/server/http/handler';

/**
 * GET /api/v1/tasks — A, M: tasks across the students in scope, with filters, cursor and
 * per-status counts (sprint-3 frontend gap 1). Filters are ANDed with the scope.
 */
export const GET = route({
  auth: true,
  query: staffTasksQuery,
  handler: async ({ auth, query }) => ok(await listStaffTasks(auth.actor, query)),
});
