import { createClient } from '@supabase/supabase-js';
import { assertValidKey, type FileStorage } from './types';

type StorageError = { status?: number; statusCode?: string; message: string };

function isMissing(error: StorageError): boolean {
  return error.statusCode === '404' || error.status === 404;
}

// Do not log provider messages, keys, headers or response bodies.
function storageError(operation: string, error: StorageError): Error {
  const status = String(error.statusCode ?? error.status ?? 'unknown');
  return new Error(
    `Supabase Storage ${operation} failed (status ${/^\d{3}$/.test(status) ? status : 'unknown'})`,
  );
}

/** Server-only credentials; the private bucket is accessed after the app's scope checks. */
export function createSupabaseStorage(config: {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}): FileStorage {
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: 'no-store',
          signal: init?.signal ?? AbortSignal.timeout(30_000),
        }),
    },
  });
  const bucket = client.storage.from(config.bucket);

  return {
    driver: 'supabase',
    async put(key, body, options) {
      assertValidKey(key);
      const { error } = await bucket.upload(key, body, {
        contentType: options?.contentType ?? 'application/octet-stream',
        upsert: false,
      });
      if (error) throw storageError('upload', error);
    },
    async get(key) {
      assertValidKey(key);
      const { data, error } = await bucket.download(key);
      if (error) {
        if (isMissing(error)) return null;
        throw storageError('download', error);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async exists(key) {
      assertValidKey(key);
      const { error } = await bucket.info(key);
      if (error) {
        if (isMissing(error)) return false;
        throw storageError('info', error);
      }
      return true;
    },
    async delete(key) {
      assertValidKey(key);
      const { error } = await bucket.remove([key]);
      if (error && !isMissing(error)) throw storageError('delete', error);
    },
  };
}
