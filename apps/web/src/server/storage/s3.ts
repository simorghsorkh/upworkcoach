import type { FileStorage } from './types';

/** S3-compatible adapter (MinIO or an Iranian object storage, ADR-0002). Not implemented yet. */
export function createS3Storage(_config: {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
}): FileStorage {
  const notImplemented = (): never => {
    throw new Error('STORAGE_DRIVER=s3 is not implemented yet');
  };
  return {
    driver: 's3',
    put: async () => notImplemented(),
    get: async () => notImplemented(),
    exists: async () => notImplemented(),
    delete: async () => notImplemented(),
  };
}
