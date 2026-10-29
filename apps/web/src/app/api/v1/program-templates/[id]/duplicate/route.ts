import { duplicateTemplateInput } from '@/modules/programs/contracts';
import { duplicateTemplate } from '@/modules/programs/service';
import { route } from '@/server/http/handler';

/** POST /api/v1/program-templates/:id/duplicate — a new draft owned by the caller. */
export const POST = route({
  auth: true,
  input: duplicateTemplateInput,
  handler: async ({ auth, params, input, meta }) => ({
    status: 201,
    body: await duplicateTemplate(auth.actor, (params as { id: string }).id, input, meta),
  }),
});
