import { exportStudentsCsv } from '@/modules/admin/csv-export';
import { requireRecentPassword } from '@/server/auth/request';
import { route } from '@/server/http/handler';

/** GET /api/v1/exports/students.csv — A. UTF-8 BOM CSV, audited (SEC-V2/V3).
 * SEC-S7 (F-06): a password entered in the last 30 minutes (else 403 REAUTH_REQUIRED). */
export const GET = route({
  auth: true,
  handler: async ({ auth, meta }) => {
    requireRecentPassword(auth);
    const file = await exportStudentsCsv(auth.actor, meta);
    return {
      raw: new TextEncoder().encode(file.content),
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${file.filename}"`,
      },
    };
  },
});
