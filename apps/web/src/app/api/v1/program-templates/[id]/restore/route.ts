import { setTemplateStatus } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/program-templates/:id/restore — editors of the template. */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params, meta }) =>
    ok(await setTemplateStatus(auth.actor, params.id, 'restore', meta)),
});
