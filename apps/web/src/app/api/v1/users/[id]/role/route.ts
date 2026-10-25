import { changeRoleInput } from '@/modules/identity/contracts';
import { changeUserRole } from '@/modules/identity/service';
import { requireRecentPassword } from '@/server/auth/request';
import { ok, route } from '@/server/http/handler';

/**
 * PATCH /api/v1/users/:id/role — admin: `{ role: 'admin'|'mentor' }` → UserListItemDTO
 * (api.md section 3, followup F-02). Last active admin or a student → 409; every session of
 * the user is revoked. SEC-S7 (F-06): a password entered in the last 30 minutes.
 */
export const PATCH = route({
  auth: true,
  input: changeRoleInput,
  handler: async ({ auth, params, input, meta }) => {
    requireRecentPassword(auth);
    return ok(await changeUserRole(auth.actor, (params as { id: string }).id, input, meta));
  },
});
