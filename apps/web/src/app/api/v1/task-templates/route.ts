import { createTaskTemplateInput, listTaskTemplatesQuery } from '@/modules/catalog/contracts';
import { createTaskTemplate, listTaskTemplates } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/task-templates — A, M; `stageId`, `includeInactive` (admin). */
export const GET = route({
  auth: true,
  query: listTaskTemplatesQuery,
  handler: async ({ auth, query }) => ok(await listTaskTemplates(auth.actor, query)),
});

/** POST /api/v1/task-templates — A. */
export const POST = route({
  auth: true,
  input: createTaskTemplateInput,
  handler: async ({ auth, input, meta }) => ({
    status: 201,
    body: await createTaskTemplate(auth.actor, input, meta),
  }),
});
