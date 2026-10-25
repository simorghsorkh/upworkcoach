import { updateProfileInput } from '@/modules/students/contracts';
import { deleteProfile, updateProfile } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/profiles/:id — A, M in scope; S own profile. */
export const PATCH = route({
  auth: true,
  input: updateProfileInput,
  handler: async ({ auth, params, input }) =>
    ok(await updateProfile(auth.actor, (params as { id: string }).id, input)),
});

/** DELETE /api/v1/profiles/:id — A, M in scope; S own profile. Soft delete → 204. */
export const DELETE = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => {
    await deleteProfile(auth.actor, params.id);
    return { status: 204 };
  },
});
