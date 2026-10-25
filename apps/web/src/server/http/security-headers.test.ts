import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce, STATIC_SECURITY_HEADERS } from './security-headers';

function directive(csp: string, name: string): string {
  return (
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `)) ?? ''
  );
}

describe('buildCsp (SEC-H1, T-HDR)', () => {
  const prod = buildCsp({ nonce: 'abc123', dev: false, upgradeInsecureRequests: true });

  it('uses the nonce and strict-dynamic for scripts', () => {
    expect(directive(prod, 'script-src')).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it('has no external source', () => {
    for (const name of ['script-src', 'connect-src', 'font-src', 'img-src', 'style-src']) {
      expect(directive(prod, name)).not.toMatch(/https?:/);
    }
    expect(prod).not.toMatch(/\*/);
  });

  it('blocks framing, objects and base-uri', () => {
    expect(directive(prod, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(prod, 'object-src')).toBe("object-src 'none'");
    expect(directive(prod, 'base-uri')).toBe("base-uri 'none'");
    expect(prod).toContain('upgrade-insecure-requests');
  });

  it('adds unsafe-eval and ws: only in development', () => {
    expect(prod).not.toContain('unsafe-eval');
    const dev = buildCsp({ nonce: 'n', dev: true, upgradeInsecureRequests: false });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toBe("connect-src 'self' ws:");
    expect(dev).not.toContain('upgrade-insecure-requests');
  });
});

describe('STATIC_SECURITY_HEADERS (SEC-H2)', () => {
  const map = new Map(STATIC_SECURITY_HEADERS.map((h) => [h.key, h.value]));

  it('contains the required headers', () => {
    expect(map.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(map.get('X-Content-Type-Options')).toBe('nosniff');
    expect(map.get('X-Frame-Options')).toBe('DENY');
    expect(map.get('Referrer-Policy')).toBe('same-origin');
    expect(map.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(map.get('Permissions-Policy')).toContain('camera=()');
  });

  it('never allows CORS (SEC-C5)', () => {
    for (const key of map.keys()) expect(key.toLowerCase()).not.toContain('access-control');
  });
});

describe('createNonce', () => {
  it('is random base64', () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});
