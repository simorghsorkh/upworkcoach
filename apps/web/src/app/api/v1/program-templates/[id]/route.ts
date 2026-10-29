import { updateTemplateInput } from '@/modules/programs/contracts';
import { deleteTemplate, getTemplate, updateTemplate } from '@/modules/programs/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/program-templates/:id — with phases and activities. */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await getTemplate(auth.actor, params.id)),
});

/** PATCH /api/v1/program-templates/:id — details and package (editors only). */
export const PATCH = route({
  auth: true,
  input: updateTemplateInput,
  handler: async ({ auth, params, input }) =>
    ok(await updateTemplate(auth.actor, (params as { id: string }).id, input)),
});

/** DELETE /api/v1/program-templates/:id — a draft that no run was made from. */
export const DELETE = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params, meta }) => {
    await deleteTemplate(auth.actor, params.id, meta);
    return { status: 204 };
  },
});
