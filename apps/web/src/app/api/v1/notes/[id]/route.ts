import { updateNoteInput } from '@/modules/timeline/contracts';
import { deleteNote, updateNote } from '@/modules/timeline/service';
import { ok, route } from '@/server/http/handler';

/** PATCH /api/v1/notes/:id — A; M = author with the student in scope (C3). */
export const PATCH = route({
  auth: true,
  input: updateNoteInput,
  handler: async ({ auth, params, input, meta }) =>
    ok(await updateNote(auth.actor, (params as { id: string }).id, input, meta)),
});

/** DELETE /api/v1/notes/:id — A; M = author with the student in scope. Soft delete → 204. */
export const DELETE = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => {
    await deleteNote(auth.actor, params.id);
    return { status: 204 };
  },
});
