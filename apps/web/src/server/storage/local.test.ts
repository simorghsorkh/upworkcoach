import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalStorage } from './local';

describe('local file storage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uc-storage-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('stores, reads and deletes a file', async () => {
    const storage = createLocalStorage(dir);
    const body = new TextEncoder().encode('سلام');

    await storage.put('attachments/2026/10/abc.txt', body);

    expect(await storage.exists('attachments/2026/10/abc.txt')).toBe(true);
    expect(
      new TextDecoder().decode((await storage.get('attachments/2026/10/abc.txt')) ?? undefined),
    ).toBe('سلام');

    await storage.delete('attachments/2026/10/abc.txt');
    expect(await storage.exists('attachments/2026/10/abc.txt')).toBe(false);
    expect(await storage.get('attachments/2026/10/abc.txt')).toBeNull();
  });

  it.each([
    '../outside.txt',
    'a/../../outside.txt',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
    'a\\b.txt',
    '',
  ])('rejects unsafe key %j', async (key) => {
    const storage = createLocalStorage(dir);
    await expect(storage.put(key, new Uint8Array([1]))).rejects.toThrow('Invalid storage key');
  });
});
