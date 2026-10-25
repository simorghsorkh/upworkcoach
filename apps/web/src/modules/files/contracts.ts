import type { ATTACHMENT_MIME_TYPES } from './schema';

/** files — attachment DTOs (api.md section 14). The same shape for staff and students. */

export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

export type AttachmentDTO = {
  id: string;
  mimeType: AttachmentMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  /** Sanitised display name (SEC-U8). */
  originalName: string;
  /** Served by our server only (no direct storage link): `GET /api/v1/attachments/:id`. */
  href: string;
};

/** POST /attachments → 201 (status `pending` until a submission links it). */
export type AttachmentUploadedDTO = AttachmentDTO & { status: 'pending' };
