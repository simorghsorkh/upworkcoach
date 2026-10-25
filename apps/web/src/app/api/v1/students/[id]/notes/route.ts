import { createNoteInput, listNotesQuery } from '@/modules/timeline/contracts';
import { createNote, listStudentNotes } from '@/modules/timeline/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/:id/notes — A, M in scope (internal and shared). */
export const GET = route({
  auth: true,
  query: listNotesQuery,
  handler: async ({ auth, params, query }) =>
    ok(await listStudentNotes(auth.actor, (params as { id: string }).id, query)),
});

/** POST /api/v1/students/:id/notes — A, M in scope; default visibility internal. */
export const POST = route({
  auth: true,
  input: createNoteInput,
  handler: async ({ auth, params, input }) => ({
    status: 201,
    body: await createNote(auth.actor, (params as { id: string }).id, input),
  }),
});
