import { sharedNotesQuery } from '@/modules/timeline/contracts';
import { listOwnSharedNotes } from '@/modules/timeline/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/me/shared-notes — S: the ONLY route where a student sees notes (shared). */
export const GET = route({
  auth: true,
  query: sharedNotesQuery,
  handler: async ({ auth, query }) => ok(await listOwnSharedNotes(auth.actor, query)),
});
