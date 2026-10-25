import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('parseEnv', () => {
  it('applies defaults for local development', () => {
    const env = parseEnv({ ...base });
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.JOBS_MODE).toBe('in-process');
    expect(env.MAX_UPLOAD_BYTES).toBe(5_242_880);
  });

  it('treats empty values as unset', () => {
    expect(parseEnv({ ...base, LOG_LEVEL: '' }).LOG_LEVEL).toBe('info');
  });

  it('requires driver-specific variables', () => {
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: 'supabase' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET/);
    expect(() => parseEnv({ ...base, JOBS_MODE: 'http-trigger' })).toThrow(/JOB_TRIGGER_SECRET/);
  });

  it('validates the Supabase storage configuration', () => {
    const config = {
      ...base,
      STORAGE_DRIVER: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-secret',
    };
    expect(parseEnv(config).SUPABASE_STORAGE_BUCKET).toBe('uploads');
    expect(() => parseEnv({ ...config, SUPABASE_URL: 'invalid' })).toThrow(/SUPABASE_URL/);
    expect(() => parseEnv({ ...config, SUPABASE_STORAGE_BUCKET: '../public' })).toThrow(
      /SUPABASE_STORAGE_BUCKET/,
    );
  });

  it('requires DEVICE_COOKIE_SECRET (32+ chars) in production only', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/DEVICE_COOKIE_SECRET/);
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', DEVICE_COOKIE_SECRET: 'too-short' }),
    ).toThrow(/DEVICE_COOKIE_SECRET/);
    const env = parseEnv({
      ...base,
      NODE_ENV: 'production',
      DEVICE_COOKIE_SECRET: 'x'.repeat(43),
      APP_BASE_URL: 'https://app.example.ir',
      TRUSTED_PROXY_HOPS: '1',
    });
    expect(env.TRUSTED_PROXY_HOPS).toBe(1);
  });

  it('requires TRUSTED_PROXY_HOPS in production only; 0 is an explicit value (F-18)', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      DEVICE_COOKIE_SECRET: 'x'.repeat(43),
      APP_BASE_URL: 'https://app.example.ir',
    };
    expect(() => parseEnv(prod)).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => parseEnv({ ...prod, TRUSTED_PROXY_HOPS: '' })).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(parseEnv({ ...prod, TRUSTED_PROXY_HOPS: '0' }).TRUSTED_PROXY_HOPS).toBe(0);
    expect(() => parseEnv({ ...prod, TRUSTED_PROXY_HOPS: '9' })).toThrow(/TRUSTED_PROXY_HOPS/);
    // Development and tests keep the default.
    expect(parseEnv({ ...base }).TRUSTED_PROXY_HOPS).toBe(0);
  });

  it('accepts a safe APP_VERSION for /healthz (F-08)', () => {
    expect(parseEnv({ ...base, APP_VERSION: 'a1b2c3d' }).APP_VERSION).toBe('a1b2c3d');
    expect(() => parseEnv({ ...base, APP_VERSION: 'bad value<script>' })).toThrow(/APP_VERSION/);
  });

  it('requires an https APP_BASE_URL in production (SEC-S8)', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      DEVICE_COOKIE_SECRET: 'x'.repeat(43),
      TRUSTED_PROXY_HOPS: '1',
    };
    expect(() => parseEnv({ ...prod, APP_BASE_URL: 'http://app.example.ir' })).toThrow(
      /APP_BASE_URL/,
    );
    expect(() => parseEnv({ ...base, APP_BASE_URL: 'http://localhost:3000' })).not.toThrow();
  });

  it('never echoes secret values in the error', () => {
    const secret = 'postgres-password-should-not-leak';
    let message = '';
    try {
      parseEnv({ DATABASE_URL: `mysql://u:${secret}@x/db` });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(secret);
  });
});
