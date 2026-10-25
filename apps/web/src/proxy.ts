import { type NextRequest, NextResponse } from 'next/server';
import { buildCsp, createNonce } from './server/http/security-headers';

/**
 * Proxy (formerly middleware): per-request CSP nonce for pages (security.md SEC-H1).
 * Static security headers come from next.config.ts `headers()`; API responses get their own
 * headers in server/http/handler.ts.
 *
 * SEC-A11: this file is never an access-control barrier. Every page checks the session with
 * requireUser() and every API route through its service.
 *
 * Nonces only work on dynamically rendered pages: a statically prerendered page has no
 * nonce on its scripts and would be blocked by this CSP. All app pages must therefore be
 * dynamic (they read the session cookie anyway); see the sprint-1 notes for frontend.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    upgradeInsecureRequests: (process.env.APP_BASE_URL ?? '').startsWith('https://'),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not API routes, Next static assets, image optimisation, fonts or icons.
      source:
        '/((?!api|healthz|_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:png|svg|ico|webp|jpg|woff2)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
