import { createStudentInput, listStudentsQuery } from '@/modules/students/contracts';
import { createStudent, listStudents } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students — A, M (scope in SQL); search, filters, sort, cursor. */
export const GET = route({
  auth: true,
  query: listStudentsQuery,
  handler: async ({ auth, query }) => ok(await listStudents(auth.actor, query)),
});

/**
 * POST /api/v1/students — A; M while `mentorsCanInviteStudents`. Creates the invited user,
 * the record and the invite link (`inviteUrl` is returned only this once; no-store).
 */
export const POST = route({
  auth: true,
  input: createStudentInput,
  handler: async ({ auth, input, meta }) => ({
    status: 201,
    body: await createStudent(auth.actor, input, meta),
  }),
});
