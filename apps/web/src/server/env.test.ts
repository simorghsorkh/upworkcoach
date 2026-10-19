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
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET/);
    expect(() => parseEnv({ ...base, JOBS_MODE: 'http-trigger' })).toThrow(/JOB_TRIGGER_SECRET/);
  });

  it('requires DEVICE_COOKIE_SECRET (32+ chars) in production only', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/DEVICE_COOKIE_SECRET/);
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', DEVICE_COOKIE_SECRET: 'too-short' }),
    ).toThrow(/DEVICE_COOKIE_SECRET/);
    const env = parseEnv({ ...base, NODE_ENV: 'production', DEVICE_COOKIE_SECRET: 'x'.repeat(43) });
    expect(env.TRUSTED_PROXY_HOPS).toBe(0);
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
