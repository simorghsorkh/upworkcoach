import { listUsersQuery } from '@/modules/identity/contracts';
import { listUsers } from '@/modules/identity/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/users?role=&status= — admin only. */
export const GET = route({
  auth: true,
  query: listUsersQuery,
  handler: async ({ auth, query }) => ok(await listUsers(auth.actor, query)),
});
