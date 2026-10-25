import { uploadAttachment } from '@/modules/files/service';
import { getEnv } from '@/server/env';
import { errors } from '@/server/http/errors';
import { parseMultipart, readBodyBytes, route } from '@/server/http/handler';

/** Multipart overhead allowed on top of the file itself (data-model.md 2-5, SEC-U4). */
const MULTIPART_SLACK = 64 * 1024;

/**
 * POST /api/v1/attachments — any signed-in user. multipart `file` (jpeg/png/webp ≤ 5 MB).
 * The byte cap is enforced before the body is buffered (413); the type comes from the
 * content (415); the image is re-encoded without metadata (C4).
 */
export const POST = route({
  auth: true,
  multipart: true,
  handler: async ({ auth, req }) => {
    const max = getEnv().MAX_UPLOAD_BYTES;
    const bytes = await readBodyBytes(req, max + MULTIPART_SLACK);
    const form = await parseMultipart(req, bytes);
    const file = form.get('file');
    if (!(file instanceof File)) throw errors.validation({ file: 'یک تصویر انتخاب کن.' });
    if (file.size > max) throw errors.validation({ file: 'حجم تصویر حداکثر ۵ مگابایت است.' });
    const body = await uploadAttachment(auth.actor, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
    });
    return { status: 201, body };
  },
});
