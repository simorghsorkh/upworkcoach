import { describe, expect, it } from 'vitest';
import { assertCsrfSafe } from './csrf';
import { ApiError } from './errors';

const ORIGIN = 'https://app.example.ir';

function req(method: string, headers: Record<string, string>) {
  return { method, headers: new Headers(headers) };
}

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.code : 'OTHER';
  }
}

const json = { 'content-type': 'application/json', 'content-length': '2' };

describe('assertCsrfSafe (SEC-C1..C3)', () => {
  it('lets GET through without Origin', () => {
    expect(codeOf(() => assertCsrfSafe(req('GET', {}), ORIGIN))).toBeNull();
  });

  it('accepts a same-origin JSON POST', () => {
    expect(codeOf(() => assertCsrfSafe(req('POST', { origin: ORIGIN, ...json }), ORIGIN))).toBe(
      null,
    );
    expect(
      codeOf(() =>
        assertCsrfSafe(
          req('POST', {
            origin: ORIGIN,
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json; charset=utf-8',
            'content-length': '2',
          }),
          ORIGIN,
        ),
      ),
    ).toBeNull();
  });

  it('rejects a missing Origin', () => {
    expect(codeOf(() => assertCsrfSafe(req('POST', json), ORIGIN))).toBe('BAD_ORIGIN');
  });

  it.each([
    'https://app.example.ir.evil.com',
    'http://app.example.ir',
    'https://evil.com',
    'null',
    'https://app.example.ir:444',
  ])('rejects Origin %s', (origin) => {
    expect(codeOf(() => assertCsrfSafe(req('DELETE', { origin, ...json }), ORIGIN))).toBe(
      'BAD_ORIGIN',
    );
  });

  it('rejects cross-site Fetch Metadata even with a matching Origin', () => {
    expect(
      codeOf(() =>
        assertCsrfSafe(
          req('POST', { origin: ORIGIN, 'sec-fetch-site': 'same-site', ...json }),
          ORIGIN,
        ),
      ),
    ).toBe('BAD_ORIGIN');
  });

  it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x'])(
    'rejects Content-Type %s',
    (contentType) => {
      expect(
        codeOf(() =>
          assertCsrfSafe(
            req('POST', { origin: ORIGIN, 'content-type': contentType, 'content-length': '5' }),
            ORIGIN,
          ),
        ),
      ).toBe('UNSUPPORTED_MEDIA_TYPE');
    },
  );

  it('allows multipart only where enabled', () => {
    const r = req('POST', {
      origin: ORIGIN,
      'content-type': 'multipart/form-data; boundary=x',
      'content-length': '5',
    });
    expect(codeOf(() => assertCsrfSafe(r, ORIGIN, { allowMultipart: true }))).toBeNull();
  });

  it('allows a body-less POST without Content-Type, but not a body without it', () => {
    expect(codeOf(() => assertCsrfSafe(req('POST', { origin: ORIGIN }), ORIGIN))).toBeNull();
    expect(
      codeOf(() => assertCsrfSafe(req('POST', { origin: ORIGIN, 'content-length': '10' }), ORIGIN)),
    ).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
