import type { Env } from '../env';
import { getEnv } from '../env';
import { createAzureBlobStorage } from './azure-blob';
import { createLocalStorage } from './local';
import { createS3Storage } from './s3';
import { createSupabaseStorage } from './supabase';
import type { FileStorage } from './types';

export type { FileStorage, StorageDriver } from './types';

/** Builds the adapter selected by STORAGE_DRIVER. Required variables are validated in env.ts. */
export function createStorage(env: Env): FileStorage {
  switch (env.STORAGE_DRIVER) {
    case 'supabase':
      return createSupabaseStorage({
        url: env.SUPABASE_URL ?? '',
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        bucket: env.SUPABASE_STORAGE_BUCKET,
      });
    case 'local':
      return createLocalStorage(env.LOCAL_STORAGE_DIR);
    case 'azure-blob':
      return createAzureBlobStorage({
        connectionString: env.AZURE_STORAGE_CONNECTION_STRING ?? '',
        container: env.AZURE_STORAGE_CONTAINER ?? '',
      });
    case 's3':
      return createS3Storage({
        endpoint: env.S3_ENDPOINT ?? '',
        bucket: env.S3_BUCKET ?? '',
        accessKey: env.S3_ACCESS_KEY ?? '',
        secretKey: env.S3_SECRET_KEY ?? '',
        region: env.S3_REGION,
      });
  }
}

let storage: FileStorage | undefined;

export function getStorage(): FileStorage {
  storage ??= createStorage(getEnv());
  return storage;
}
