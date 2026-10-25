import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { parseEnv } from '../src/server/env';
import { createSupabaseStorage } from '../src/server/storage/supabase';
import { loadRootEnv } from './lib/env';

loadRootEnv();
const env = parseEnv(process.env);
if (env.STORAGE_DRIVER !== 'supabase') throw new Error('Set STORAGE_DRIVER=supabase first');
const config = {
  url: env.SUPABASE_URL ?? '',
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  bucket: env.SUPABASE_STORAGE_BUCKET,
};
const client = createClient(config.url, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data, error } = await client.storage.getBucket(config.bucket);
if (error || !data)
  throw new Error('Cannot inspect storage bucket; check server key and bucket name');
if (data.public) throw new Error('The storage bucket must be private');
const storage = createSupabaseStorage(config);
const key = `storage-check/${randomUUID()}.png`;
// A 1x1 PNG; no user data or attachment database rows are touched.
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ZkAAAAASUVORK5CYII=',
  'base64',
);
await storage.put(key, bytes, { contentType: 'image/png' });
try {
  if (!(await storage.exists(key))) throw new Error('Uploaded file was not found');
  const downloaded = await storage.get(key);
  if (!downloaded || !bytes.equals(downloaded)) throw new Error('Downloaded bytes do not match');
} finally {
  await storage.delete(key);
}
if (await storage.exists(key)) throw new Error('Temporary test file was not deleted');
console.info('Private bucket verified; upload, download and deletion passed.');
