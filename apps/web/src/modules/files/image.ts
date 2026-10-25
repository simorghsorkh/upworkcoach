import sharp from 'sharp';
import { QueueTimeoutError, Semaphore } from '@/server/concurrency';
import { ApiError, errors } from '@/server/http/errors';
import type { AttachmentMimeType } from './contracts';

/**
 * Image processing for uploads (security.md C4, SEC-U1/U2/U3/U5), in this order:
 *  1. type from the CONTENT (`metadata().format` ∈ jpeg|png|webp), never from the client;
 *  2. more than 40 megapixels → 422 (decompression bombs);
 *  3. `.rotate()` (apply EXIF orientation) → resize to fit 4096 px → re-encode to the same
 *     format WITHOUT `withMetadata()`: EXIF, GPS, ICC and XMP are dropped. The original
 *     bytes are never stored.
 * At most 2 images are processed at once per instance (libvips itself single-threaded).
 */

export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_OUTPUT_EDGE = 4096;

sharp.concurrency(1);
const queue = new Semaphore(2, 10_000);

const FORMATS: Record<string, AttachmentMimeType> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export type ProcessedImage = {
  data: Buffer;
  mimeType: AttachmentMimeType;
  width: number;
  height: number;
};

const UNSUPPORTED = 'فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود.';

export async function processImage(input: Uint8Array): Promise<ProcessedImage> {
  try {
    return await queue.run(() => processNow(input));
  } catch (err) {
    if (err instanceof QueueTimeoutError) throw errors.busy(10);
    throw err;
  }
}

async function processNow(input: Uint8Array): Promise<ProcessedImage> {
  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: false } as const;
  let format: string | undefined;
  let width = 0;
  let height = 0;
  try {
    // Header only (no pixel decoding): read the real dimensions so an oversized image gets
    // its own 422 below instead of sharp's generic pixel-limit error.
    const meta = await sharp(input, { ...options, limitInputPixels: false }).metadata();
    format = meta.format;
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', { message: UNSUPPORTED });
  }
  const mimeType = format ? FORMATS[format] : undefined;
  if (!mimeType) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', { message: UNSUPPORTED });
  if (width * height > MAX_INPUT_PIXELS) {
    throw errors.validation(
      { file: 'ابعاد تصویر خیلی بزرگ است (حداکثر ۴۰ مگاپیکسل).' },
      'ابعاد تصویر خیلی بزرگ است.',
    );
  }
  try {
    let pipeline = sharp(input, options).rotate().resize({
      width: MAX_OUTPUT_EDGE,
      height: MAX_OUTPUT_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
    pipeline =
      format === 'png'
        ? pipeline.png({ compressionLevel: 9 })
        : format === 'webp'
          ? pipeline.webp({ quality: 85 })
          : pipeline.jpeg({ quality: 85, mozjpeg: true });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { data, mimeType, width: info.width, height: info.height };
  } catch {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', { message: UNSUPPORTED });
  }
}

/**
 * Display name of an upload (SEC-U8, SEC-X5): no directory part, no control or bidi
 * characters, at most 200 characters. Never used to build a storage key.
 */
export function sanitizeFileName(name: string | null | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters.
    .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'image' : cleaned;
}
