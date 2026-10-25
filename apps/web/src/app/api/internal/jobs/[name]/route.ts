import { handleJobTrigger } from '@/server/jobs/trigger';

/**
 * POST /api/internal/jobs/:name — only with JOBS_MODE=http-trigger and a valid
 * `X-Job-Secret` (ADR-0007, SEC-J1..J3); 404 in every other case.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await context.params;
  return handleJobTrigger(req, name);
}
