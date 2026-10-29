import type { z } from 'zod';
import { type Locale, localeFromAcceptLanguage } from '@/i18n/config';
import type { RequestMeta } from '@/modules/identity/service';
import { type AuthenticatedRequest, authenticateRequest, requestMeta } from '../auth/request';
import { getEnv } from '../env';
import { logger, safeError } from '../logger';
import { assertCsrfSafe, isStateChanging } from './csrf';
import { ApiError, errors } from './errors';
import { API_CSP } from './security-headers';
import { parseOrThrow, zodIssueSummary } from './validation';

/**
 * Thin Route Handler wrapper (tech-stack.md section 3): CSRF → session → zod → service → DTO.
 * Business rules and access checks live in services; this only does HTTP.
 *
 * Every response: `Cache-Control: private, no-store` (SEC-H3), a restrictive CSP, no CORS
 * headers (SEC-C5). Errors: `{ error: { code, message (Persian), fields? } }` (api.md 1).
 * Logs: method, path without query, status, duration, requestId, userId — never bodies,
 * cookies or tokens (SEC-L2).
 */

export const MAX_JSON_BODY_BYTES = 256 * 1024; // SEC-V1

type Params = Record<string, string>;
type NextContext<P extends Params> = { params: Promise<P> };

export type HandlerResult = {
  status?: number;
  body?: unknown;
  /**
   * Binary body (attachment download). Its `content-type` and `content-security-policy`
   * come from `headers`; `Cache-Control: private, no-store` is still forced.
   */
  raw?: Uint8Array;
  headers?: Record<string, string>;
  cookies?: string[];
};

type BaseCtx<P extends Params, I, Q> = {
  req: Request;
  params: P;
  input: I;
  query: Q;
  meta: RequestMeta;
  requestId: string;
};

type Options<P extends Params, I, Q, Auth extends boolean> = {
  /** true: a valid session is required (401 otherwise). */
  auth: Auth;
  /** zod schema for the JSON body (non-GET). Omit for body-less endpoints. */
  input?: z.ZodType<I>;
  /** zod schema for the query string (GET filters). */
  query?: z.ZodType<Q>;
  /**
   * multipart/form-data endpoint (`POST /attachments`, `POST /imports/students`): the CSRF
   * check accepts multipart, and the body is NOT read here — the handler reads it with
   * `readBodyBytes(req, cap)` (SEC-U4: byte cap before buffering).
   */
  multipart?: boolean;
  handler: (
    ctx: BaseCtx<P, I, Q> & (Auth extends true ? { auth: AuthenticatedRequest } : object),
  ) => Promise<HandlerResult>;
};

export function route<
  P extends Params = Params,
  I = undefined,
  Q = undefined,
  Auth extends boolean = true,
>(options: Options<P, I, Q, Auth>) {
  return async function handle(req: Request, context?: NextContext<P>): Promise<Response> {
    const started = performance.now();
    const requestId = crypto.randomUUID();
    const path = safePath(req.url);
    let userId: string | undefined;
    let response: Response;
    try {
      assertCsrfSafe(req, new URL(getEnv().APP_BASE_URL).origin, {
        allowMultipart: options.multipart === true,
      });

      let auth: AuthenticatedRequest | null = null;
      if (options.auth) {
        auth = await authenticateRequest(req);
        if (!auth) throw errors.unauthenticated();
        userId = auth.actor.userId;
      }

      const input = options.input
        ? parseOrThrow(options.input, await readJsonBody(req))
        : options.multipart
          ? undefined
          : await assertNoBody(req);
      const query = options.query
        ? parseOrThrow(options.query, Object.fromEntries(new URL(req.url).searchParams))
        : undefined;
      const params = ((await context?.params) ?? {}) as P;

      const ctx = {
        req,
        params,
        input: input as I,
        query: query as Q,
        meta: requestMeta(req),
        requestId,
        ...(auth ? { auth } : {}),
      } as Parameters<Options<P, I, Q, Auth>['handler']>[0];
      response = toResponse(await options.handler(ctx));
    } catch (err) {
      response = errorResponse(err, {
        requestId,
        path,
        locale: localeFromAcceptLanguage(req.headers.get('accept-language')),
      });
    }
    finalizeHeaders(response.headers);
    logger.info(
      {
        event: 'http.request',
        requestId,
        method: req.method,
        path,
        status: response.status,
        ms: Math.round(performance.now() - started),
        userId,
      },
      'request',
    );
    return response;
  };
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '?';
  }
}

function toResponse(result: HandlerResult): Response {
  const headers = new Headers(result.headers);
  for (const cookie of result.cookies ?? []) headers.append('set-cookie', cookie);
  const status = result.status ?? 200;
  if (result.raw) {
    headers.set('content-length', String(result.raw.byteLength));
    return new Response(result.raw as unknown as BodyInit, { status, headers });
  }
  if (result.body === undefined || status === 204) return new Response(null, { status, headers });
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(result.body), { status, headers });
}

function finalizeHeaders(headers: Headers): void {
  headers.set('cache-control', 'private, no-store');
  // A binary response (attachment) brings its own, equally strict CSP (SEC-U6).
  if (!headers.has('content-security-policy')) headers.set('content-security-policy', API_CSP);
  headers.set('x-content-type-options', 'nosniff');
}

export function errorResponse(
  err: unknown,
  context: { requestId: string; path: string; locale?: Locale },
): Response {
  const apiError =
    err instanceof ApiError
      ? err
      : (() => {
          logger.error(
            {
              event: 'http.unhandled',
              requestId: context.requestId,
              path: context.path,
              error: describeError(err),
            },
            'unhandled error',
          );
          return new ApiError('INTERNAL');
        })();
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  if (apiError.retryAfterSeconds !== undefined) {
    headers.set('retry-after', String(apiError.retryAfterSeconds));
  }
  return new Response(JSON.stringify(apiError.toBody(context.locale)), {
    status: apiError.status,
    headers,
  });
}

/** Error summary without values that may contain user input (SEC-L4). */
function describeError(err: unknown): Record<string, unknown> {
  if (
    err &&
    typeof err === 'object' &&
    'issues' in err &&
    Array.isArray((err as z.ZodError).issues)
  ) {
    return { type: 'ZodError', issues: zodIssueSummary(err as z.ZodError) };
  }
  // F-17: database errors lose their message (SQL + parameters); see safeError.
  return safeError(err);
}

/** Reads the body with a hard byte cap BEFORE parsing (SEC-V1). Empty body → {}. */
async function readJsonBody(req: Request): Promise<unknown> {
  if (!isStateChanging(req.method)) return {};
  const text = await readBodyText(req, MAX_JSON_BODY_BYTES);
  if (text.trim() === '') return {};
  if (req.headers.get('content-type') === null) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
  try {
    return JSON.parse(text);
  } catch {
    throw errors.validation({ _: 'بدنه‌ی درخواست JSON معتبر نیست.' });
  }
}

/** Body-less endpoints still refuse oversized or non-JSON bodies, and ignore `{}`. */
async function assertNoBody(req: Request): Promise<undefined> {
  if (!isStateChanging(req.method)) return undefined;
  const text = await readBodyText(req, MAX_JSON_BODY_BYTES);
  const trimmed = text.trim();
  if (trimmed !== '' && trimmed !== '{}') {
    throw errors.validation({ _: 'این درخواست بدنه نمی‌گیرد.' });
  }
  return undefined;
}

export async function readBodyText(req: Request, limit: number): Promise<string> {
  return new TextDecoder('utf-8', { fatal: false }).decode(await readBodyBytes(req, limit));
}

/**
 * Reads the raw body with a hard byte cap: a declared `Content-Length` over the cap → 413 at
 * once; otherwise the stream is counted and cancelled as soon as it passes the cap
 * (SEC-V1, SEC-U4). Never buffers more than `limit` bytes.
 */
export async function readBodyBytes(req: Request, limit: number): Promise<Buffer> {
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > limit) throw new ApiError('PAYLOAD_TOO_LARGE');
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ApiError('PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Parses a multipart body that was already read under a byte cap (never the live stream).
 * Anything that is not valid multipart → 415.
 */
export async function parseMultipart(req: Request, bytes: Buffer): Promise<FormData> {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
  }
  try {
    return await new Response(bytes as unknown as BodyInit, {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
  }
}

/** Helper for JSON results. */
export function ok(body: unknown, init: Omit<HandlerResult, 'body'> = {}): HandlerResult {
  return { status: 200, ...init, body };
}
