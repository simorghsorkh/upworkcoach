import { ApiError } from './errors';

/**
 * CSRF protection for state-changing requests (ADR-0003 section 6, security.md SEC-C1..C3).
 * SameSite=Lax cookies + exact Origin match + Sec-Fetch-Site + JSON-only bodies.
 * No CSRF token is needed with these layers.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isStateChanging(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Throws 403 BAD_ORIGIN / 415 UNSUPPORTED_MEDIA_TYPE, or returns normally.
 * `appOrigin` is `new URL(APP_BASE_URL).origin`.
 *
 * Content-Type rule (assumption, sprint-1 notes): a request WITH a body must be
 * `application/json`; a body-less POST (logout, invite-link, …) may omit Content-Type.
 * A cross-site HTML form always sends a Content-Type, so this keeps SEC-C3's intent.
 * multipart is only for `/attachments` and `/imports/students` (later sprints).
 */
export function assertCsrfSafe(
  req: Pick<Request, 'method' | 'headers'>,
  appOrigin: string,
  options: { allowMultipart?: boolean } = {},
): void {
  if (!isStateChanging(req.method)) return;

  const origin = req.headers.get('origin');
  // SEC-C1: Origin must be present and match exactly (no includes/startsWith).
  if (!origin || origin !== appOrigin) throw new ApiError('BAD_ORIGIN');

  // SEC-C2: second layer when the browser sends Fetch Metadata.
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') throw new ApiError('BAD_ORIGIN');

  // SEC-C3
  const contentType = req.headers.get('content-type');
  const hasBody = requestHasBody(req.headers);
  if (contentType === null) {
    if (hasBody) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
    return;
  }
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase();
  if (mediaType === 'application/json') return;
  if (options.allowMultipart && mediaType === 'multipart/form-data') return;
  throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
}

function requestHasBody(headers: Pick<Headers, 'get'>): boolean {
  const length = headers.get('content-length');
  if (length !== null) return Number(length) > 0;
  return headers.get('transfer-encoding') !== null;
}
