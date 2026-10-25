import { updateTaskTemplateInput } from '@/modules/catalog/contracts';
import { updateTaskTemplate } from '@/modules/catalog/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/task-templates/:id — A (deactivate with `isActive: false`). */
export const PATCH = route({
  auth: true,
  input: updateTaskTemplateInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await updateTaskTemplate(auth.actor, (params as { id: string }).id, input, meta)),
});
