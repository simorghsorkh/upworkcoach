import { revokeOwnSession } from '@/modules/identity/service';
import { route } from '@/server/http/handler';

/** DELETE /api/v1/auth/sessions/:id — sign out one of the user's own devices. */
export const DELETE = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => {
    await revokeOwnSession(auth.actor, params.id);
    return { status: 204 };
  },
});
