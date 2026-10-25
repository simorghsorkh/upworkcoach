import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseStorage } from './supabase';

const config = {
  url: 'https://example.supabase.co',
  serviceRoleKey: 'test-server-secret',
  bucket: 'uploads',
};
const key = 'attachments/test-image';

afterEach(() => vi.unstubAllGlobals());

describe('Supabase private storage', () => {
  it('sends authenticated uploads without overwriting existing objects and downloads bytes without caching', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ Key: `uploads/${key}` }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', request);
    const storage = createSupabaseStorage(config);
    await storage.put(key, new Uint8Array([1, 2, 3]), { contentType: 'image/png' });
    expect(await storage.get(key)).toEqual(new Uint8Array([1, 2, 3]));
    const call = request.mock.calls[0];
    if (!call) throw new Error('Expected an upload request');
    const [url, init] = call;
    expect(String(url)).toBe(`https://example.supabase.co/storage/v1/object/uploads/${key}`);
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${config.serviceRoleKey}`);
    expect(headers.get('x-upsert')).toBe('false');
    expect(headers.get('content-type')).toBe('image/png');
    expect(init.cache).toBe('no-store');
    expect(request.mock.calls[1]?.[1].cache).toBe('no-store');
  });

  it('recognizes legacy HTTP 400 responses carrying a 404 object status', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Response.json(
            { statusCode: '404', error: 'not_found', message: 'Object not found' },
            { status: 400 },
          ),
        ),
    );
    const storage = createSupabaseStorage(config);
    expect(await storage.get(key)).toBeNull();
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });

  it.each(['get', 'exists', 'delete'] as const)(
    'does not treat permission failures as missing objects in %s',
    async (operation) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementation(() =>
            Response.json(
              { statusCode: '403', message: `private provider details ${config.serviceRoleKey}` },
              { status: 403 },
            ),
          ),
      );
      const storage = createSupabaseStorage(config);
      await expect(storage[operation](key)).rejects.toThrow(/status 403/);
      await expect(storage[operation](key)).rejects.not.toThrow(config.serviceRoleKey);
    },
  );

  it('checks existence and deletes only the selected object', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ name: key, id: 'test' }))
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal('fetch', request);
    const storage = createSupabaseStorage(config);
    expect(await storage.exists(key)).toBe(true);
    await storage.delete(key);
    expect(request.mock.calls[1]?.[1].method).toBe('DELETE');
    expect(JSON.parse(request.mock.calls[1]?.[1].body)).toEqual({ prefixes: [key] });
  });

  it('rejects unsafe paths before contacting the provider', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const storage = createSupabaseStorage(config);
    for (const unsafe of ['../escape', '/absolute', 'a/../b', 'a\\b', '']) {
      await expect(storage.put(unsafe, new Uint8Array())).rejects.toThrow('Invalid storage key');
      await expect(storage.get(unsafe)).rejects.toThrow('Invalid storage key');
      await expect(storage.exists(unsafe)).rejects.toThrow('Invalid storage key');
      await expect(storage.delete(unsafe)).rejects.toThrow('Invalid storage key');
    }
    expect(request).not.toHaveBeenCalled();
  });
});
