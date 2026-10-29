import { importStudents, MAX_IMPORT_BYTES } from '@/modules/admin/student-import';
import { errors } from '@/server/http/errors';
import { parseMultipart, readBodyBytes, route } from '@/server/http/handler';

/**
 * POST /api/v1/imports/students — A. multipart: `file` (CSV UTF-8, ≤ 1 MB, ≤ 500 rows) and
 * `dryRun` (`true` by default; `false` imports the valid rows), and optional `runId` (an open
 * group course every row joins, sprint 6). The response may contain
 * invite links: `no-store` (set by `route()`), never logged (SEC-V5).
 */
export const POST = route({
  auth: true,
  multipart: true,
  handler: async ({ auth, req, meta }) => {
    if (auth.actor.role !== 'admin') throw errors.forbidden();
    const bytes = await readBodyBytes(req, MAX_IMPORT_BYTES + 64 * 1024);
    const form = await parseMultipart(req, bytes);
    const file = form.get('file');
    if (!(file instanceof File)) throw errors.validation({ file: 'فایل CSV را انتخاب کن.' });
    const dryRunField = form.get('dryRun');
    if (dryRunField !== null && dryRunField !== 'true' && dryRunField !== 'false') {
      throw errors.validation({ dryRun: 'مقدار نامعتبر است' });
    }
    const runField = form.get('runId');
    const body = await importStudents(
      auth.actor,
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        dryRun: dryRunField !== 'false',
        runId: typeof runField === 'string' && runField !== '' ? runField : null,
      },
      meta,
    );
    return { status: 200, body };
  },
});
