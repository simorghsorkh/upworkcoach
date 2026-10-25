import { createInviteLink } from '@/modules/identity/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/users/:id/invite-link — admin; mentor only for invited students in scope (C3). */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params, meta }) => ({
    status: 201,
    body: await createInviteLink(auth.actor, params.id, meta),
  }),
});
