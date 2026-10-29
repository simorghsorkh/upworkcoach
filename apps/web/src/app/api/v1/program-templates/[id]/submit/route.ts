import { submitTemplate } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/program-templates/:id/submit — M: send an own template for organization use. */
export const POST = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params, meta }) => ok(await submitTemplate(auth.actor, params.id, meta)),
});
