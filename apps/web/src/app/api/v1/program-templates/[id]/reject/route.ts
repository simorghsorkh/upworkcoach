import { rejectTemplateInput } from '@/modules/programs/contracts';
import { decideTemplate } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** POST /api/v1/program-templates/:id/reject — A: back to private, with the reason. */
export const POST = route({
  auth: true,
  input: rejectTemplateInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(
      await decideTemplate(
        auth.actor,
        (params as { id: string }).id,
        { approve: false, reason: input.reason },
        meta,
      ),
    ),
});
