import { studentTagsQuery } from '@/modules/students/contracts';
import { listStudentTags } from '@/modules/students/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/students/tags — A, M: tags in the scope with their counts. */
export const GET = route({
  auth: true,
  query: studentTagsQuery,
  handler: async ({ auth, query }) => ok(await listStudentTags(auth.actor, query)),
});
