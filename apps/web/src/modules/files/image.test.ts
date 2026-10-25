import zlib from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/server/http/errors';
import { processImage, sanitizeFileName } from './image';

/** A PNG header that claims `w × h` pixels (no decodable data): a decompression bomb. */
function bombPng(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc(16))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const base = (w = 20, h = 10) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#ff0000' } });

async function expectStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    return;
  }
  throw new Error('expected an error');
}

describe('processImage (C4, SEC-U1/U2/U5)', () => {
  it('re-encodes jpeg/png/webp with the type from the content', async () => {
    for (const [format, mime] of [
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
      ['webp', 'image/webp'],
    ] as const) {
      const input = await base().toFormat(format).toBuffer();
      const out = await processImage(input);
      expect(out.mimeType).toBe(mime);
      expect([out.width, out.height]).toEqual([20, 10]);
    }
  });

  it('drops EXIF and applies the orientation first', async () => {
    const input = await base(20, 10)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Artist: 'CANARY-EXIF-41', Copyright: 'CANARY-EXIF-41' } })
      .toBuffer();
    expect(input.includes(Buffer.from('CANARY-EXIF-41'))).toBe(true);
    const out = await processImage(input);
    expect(out.data.includes(Buffer.from('CANARY-EXIF-41'))).toBe(false);
    const meta = await sharp(out.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // Rotated by 90°: 20×10 becomes 10×20.
    expect([out.width, out.height]).toEqual([10, 20]);
  });

  it('caps the longest edge at 4096 px without enlarging', async () => {
    const out = await processImage(await base(5000, 100).png().toBuffer());
    expect(out.width).toBe(4096);
    expect(out.height).toBeLessThanOrEqual(100);
    const small = await processImage(await base(30, 30).png().toBuffer());
    expect(small.width).toBe(30);
  });

  it('refuses HTML, SVG and GIF with 415 (content, not the declared type)', async () => {
    await expectStatus(processImage(Buffer.from('<html><script>alert(1)</script></html>')), 415);
    await expectStatus(
      processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')),
      415,
    );
    await expectStatus(processImage(await base().gif().toBuffer()), 415);
  });

  it('refuses images over 40 megapixels with 422 before decoding', async () => {
    await expectStatus(processImage(bombPng(8000, 8000)), 422);
  });
});

describe('sanitizeFileName (SEC-U8, SEC-X5)', () => {
  it('drops directories, control and bidi characters; caps the length', () => {
    expect(sanitizeFileName('C:\\Users\\me\\photo.png')).toBe('photo.png');
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('gnp.\u202Eexe.png')).toBe('gnp.exe.png');
    expect(sanitizeFileName('a\u0000b\nc.png')).toBe('abc.png');
    expect(sanitizeFileName('x'.repeat(300))).toHaveLength(200);
    expect(sanitizeFileName('')).toBe('image');
    expect(sanitizeFileName(null)).toBe('image');
    expect(sanitizeFileName('..')).toBe('image');
  });
});
