/**
 * Minimal browser client for the JSON API (docs/04-architecture/api.md §1).
 * Never throws: every outcome becomes an ApiResult so forms can map it to a message.
 * Same-origin fetch sends the session cookie and the Origin header the CSRF check needs.
 */

export type ApiError = {
  /** HTTP status; 0 = network failure (offline, DNS, blocked). */
  status: number;
  /** api.md error code, e.g. INVALID_CREDENTIALS, VALIDATION_FAILED, TOO_MANY_ATTEMPTS. */
  code: string;
  /** Persian message from the server, or our fallback for the status. */
  message: string;
  /** Per-field messages for 422 VALIDATION_FAILED. */
  fields: Record<string, string>;
  /** From 429 body (`retryAfterSeconds`) or the Retry-After header. */
  retryAfterSeconds?: number;
};

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; error: ApiError };

const FALLBACK: Record<number, string> = {
  0: 'اتصال برقرار نشد. اینترنتت را بررسی کن و دوباره بزن.',
  401: 'نشست تو تمام شده است. دوباره وارد شو.',
  403: 'اجازه‌ی این کار را نداری.',
  404: 'پیدا نشد.',
  409: 'این تغییر با وضعیت فعلی هم‌خوانی ندارد. صفحه را تازه کن.',
  410: 'این لینک دیگر کار نمی‌کند.',
  422: 'چند مورد را باید درست کنی.',
  429: 'تلاش‌ها زیاد بود. کمی صبر کن.',
  503: 'سرور الان شلوغ است. چند ثانیه‌ی دیگر دوباره بزن.',
};

export function fallbackMessage(status: number): string {
  return FALLBACK[status] ?? 'مشکلی پیش آمد. دوباره امتحان کن.';
}

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
    retryAfterSeconds?: number;
  };
  retryAfterSeconds?: number;
};

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.round((at - Date.now()) / 1000));
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      // FormData: the browser sets the multipart Content-Type with its boundary.
      headers:
        body === undefined || form
          ? { Accept: 'application/json' }
          : {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
      body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: { status: 0, code: 'NETWORK', message: fallbackMessage(0), fields: {} },
    };
  }

  let json: unknown = null;
  if (res.status !== 204) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  }

  if (res.ok) return { ok: true, status: res.status, data: json as T };

  const parsed = (json ?? {}) as ErrorBody;
  const retryAfterSeconds =
    parsed.error?.retryAfterSeconds ??
    parsed.retryAfterSeconds ??
    parseRetryAfter(res.headers.get('Retry-After'));
  return {
    ok: false,
    error: {
      status: res.status,
      code: parsed.error?.code ?? `HTTP_${res.status}`,
      message: parsed.error?.message || fallbackMessage(res.status),
      fields: parsed.error?.fields ?? {},
      retryAfterSeconds,
    },
  };
}

export function apiPost<T = unknown>(path: string, body?: unknown) {
  return apiRequest<T>('POST', path, body);
}

export function apiGet<T = unknown>(path: string) {
  return apiRequest<T>('GET', path);
}

export function apiPut<T = unknown>(path: string, body?: unknown) {
  return apiRequest<T>('PUT', path, body);
}

export function apiPatch<T = unknown>(path: string, body?: unknown) {
  return apiRequest<T>('PATCH', path, body);
}

export function apiDelete(path: string) {
  return apiRequest<null>('DELETE', path);
}

/** `multipart/form-data` upload (attachments, CSV import); never set Content-Type by hand. */
export function apiUpload<T = unknown>(path: string, form: FormData) {
  return apiRequest<T>('POST', path, form);
}
