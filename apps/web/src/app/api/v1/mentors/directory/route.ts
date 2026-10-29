import { mentorDirectoryQuery } from '@/modules/mentors/contracts';
import { listMentorDirectory } from '@/modules/mentors/service';
import { ok, route } from '@/server/http/handler';

/** GET /api/v1/mentors/directory — A, M: the staff directory with workload; search and filters. */
export const GET = route({
  auth: true,
  query: mentorDirectoryQuery,
  handler: async ({ auth, query }) => ok(await listMentorDirectory(auth.actor, query)),
});
