import { decideTemplate } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/program-templates/:id/approve — A: a mentor's template becomes organization-wide. */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params, meta }) =>
    ok(await decideTemplate(auth.actor, params.id, { approve: true }, meta)),
});
