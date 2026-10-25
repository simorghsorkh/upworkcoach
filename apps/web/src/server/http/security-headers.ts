/**
 * Security headers and CSP (security.md SEC-H1..H3). Dependency-free so both next.config.ts
 * and src/proxy.ts can import it.
 */

export type CspOptions = {
  nonce: string;
  /** next dev needs 'unsafe-eval' (React debugging) and ws: (HMR). */
  dev: boolean;
  /** Only on https deployments; on http://localhost it would break local development. */
  upgradeInsecureRequests: boolean;
};

/** Page CSP. No external source anywhere: no CDN, fonts, analytics (SEC-H1). */
export function buildCsp({ nonce, dev, upgradeInsecureRequests }: CspOptions): string {
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // 'unsafe-inline' only for Radix style attributes (SEC-H1).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (upgradeInsecureRequests) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** CSP for API responses (JSON is never rendered as a document). */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Headers on every response (SEC-H2). `X-Powered-By` is removed with poweredByHeader: false. */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // No `preload` until the production domain is final (E4).
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
];

/** Invite and reset pages carry the token in the fragment: no referrer, no cache (SEC-T3). */
export const TOKEN_PAGE_PATHS = ['/invite', '/reset'] as const;
export const TOKEN_PAGE_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'no-store' },
];

/** 16 random bytes, base64 — fresh for every page request. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * CSP for attachment downloads (SEC-U6, C4): the image may be shown, nothing else may run,
 * and opened as a document it is sandboxed.
 */
export const ATTACHMENT_CSP = "default-src 'none'; img-src 'self'; sandbox";
