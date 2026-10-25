import { createSnapshotInput } from '@/modules/students/contracts';
import { createProfileSnapshot, listProfileSnapshots } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/profiles/:id/snapshots — A, M in scope; S own profile. Newest first. */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => ok(await listProfileSnapshots(auth.actor, params.id)),
});

/** POST /api/v1/profiles/:id/snapshots — A, M in scope; S own profile. */
export const POST = route({
  auth: true,
  input: createSnapshotInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await createProfileSnapshot(auth.actor, (params as { id: string }).id, input),
  }),
});
