import { createTemplateInput, templateListQuery } from '@/modules/programs/contracts';
import { createTemplate, listTemplates } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/program-templates — A: all; M: organization templates and their own. */
export const GET = route({
  auth: true,
  query: templateListQuery,
  handler: async ({ auth, query }) => ok(await listTemplates(auth.actor, query)),
});

/** POST /api/v1/program-templates — A (organization template) or M (private draft). */
export const POST = route({
  auth: true,
  input: createTemplateInput,
  handler: async ({ auth, input, meta }) => ({
    status: 201,
    body: await createTemplate(auth.actor, input, meta),
  }),
});
