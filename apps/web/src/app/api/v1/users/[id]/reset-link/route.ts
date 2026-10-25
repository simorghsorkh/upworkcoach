import { createResetLink } from '@/modules/identity/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/users/:id/reset-link — admin only; 24-hour link (ADR-0003 section 7). */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params, meta }) => ({
    status: 201,
    body: await createResetLink(auth.actor, params.id, meta),
  }),
});
