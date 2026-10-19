export type StorageDriver = 'local' | 'azure-blob' | 's3';

/**
 * File storage port (ADR-0002 section 6). Uploads and downloads always go through
 * our server, so access control stays in one place; no signed public URLs.
 *
 * Keys are opaque, server-generated paths such as `attachments/2026/10/<uuid>`.
 * Never build a key from user input (file names, ids from the request body).
 */
export interface FileStorage {
  readonly driver: StorageDriver;
  put(key: string, body: Uint8Array, options?: { contentType?: string }): Promise<void>;
  /** Returns null when the object does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  /** Deleting a missing object is not an error. */
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** Rejects absolute paths, `..`, backslashes and anything outside a safe charset. */
export function assertValidKey(key: string): void {
  if (key.length > 512 || !KEY_PATTERN.test(key) || key.split('/').includes('..')) {
    throw new Error('Invalid storage key');
  }
}
