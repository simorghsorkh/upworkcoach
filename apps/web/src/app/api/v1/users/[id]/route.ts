import { updateUserInput } from '@/modules/identity/contracts';
import { updateUser } from '@/modules/identity/service';
import { ok, route } from '@/server/http/handler';

/**
 * PATCH /api/v1/users/:id — admin: `{ displayName?, phone?, status?: 'active'|'disabled',
 * ifUpdatedAt? }` → UserListItemDTO (api.md section 3, followup F-02). Disabling and a new
 * phone revoke every session of the user; erased user → 409.
 */
export const PATCH = route({
  auth: true,
  input: updateUserInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await updateUser(auth.actor, (params as { id: string }).id, input, meta)),
});
