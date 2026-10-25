import { getAttachmentFile } from '@/modules/files/service';
import { route } from '@/server/http/handler';
import { ATTACHMENT_CSP } from '@/server/http/security-headers';

/**
 * GET /api/v1/attachments/:id — whoever may read the parent (pending: the uploader only).
 * Streamed by our server with the SEC-U6 headers. `Cache-Control: private, no-store` is
 * set by `route()` (stricter than the `no-cache` of api.md 14; same effect without ETags).
 */
export const GET = route<{ id: string }>({
  auth: true,
  handler: async ({ auth, params }) => {
    const file = await getAttachmentFile(auth.actor, params.id);
    return {
      raw: file.bytes,
      headers: {
        'content-type': file.mimeType,
        'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        'content-security-policy': ATTACHMENT_CSP,
      },
    };
  },
});
