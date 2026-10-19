import type { FileStorage } from './types';

/** Azure Blob Storage adapter (production on Azure, ADR-0002). Not implemented yet. */
export function createAzureBlobStorage(_config: {
  connectionString: string;
  container: string;
}): FileStorage {
  const notImplemented = (): never => {
    throw new Error('STORAGE_DRIVER=azure-blob is not implemented yet');
  };
  return {
    driver: 'azure-blob',
    put: async () => notImplemented(),
    get: async () => notImplemented(),
    exists: async () => notImplemented(),
    delete: async () => notImplemented(),
  };
}
