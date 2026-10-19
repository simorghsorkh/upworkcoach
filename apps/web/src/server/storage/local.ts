import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertValidKey, type FileStorage } from './types';

/**
 * Local-disk adapter: development (`.data/uploads`) and single-server hosting
 * with a mounted volume (e.g. an Iranian VPS). Content type is not persisted;
 * callers keep it in the `attachments` table.
 */
export function createLocalStorage(baseDir: string): FileStorage {
  const root = path.resolve(baseDir);

  function resolveKey(key: string): string {
    assertValidKey(key);
    const target = path.resolve(root, ...key.split('/'));
    if (!target.startsWith(root + path.sep)) throw new Error('Invalid storage key');
    return target;
  }

  return {
    driver: 'local',

    async put(key, body) {
      const target = resolveKey(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      // Write to a temp file first so readers never see a partial file.
      const temp = `${target}.${randomUUID()}.tmp`;
      await fs.writeFile(temp, body);
      await fs.rename(temp, target);
    },

    async get(key) {
      try {
        return new Uint8Array(await fs.readFile(resolveKey(key)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },

    async exists(key) {
      try {
        return (await fs.stat(resolveKey(key))).isFile();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw err;
      }
    },

    async delete(key) {
      await fs.rm(resolveKey(key), { force: true });
    },
  };
}
