/**
 * Structured API errors (api.md section 1). `message` is Persian and safe to show to the user;
 * it never contains internal details.
 */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'BAD_ORIGIN'
  | 'REAUTH_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PHONE_TAKEN'
  | 'INVALID_TRANSITION'
  | 'TOKEN_EXPIRED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'TOO_MANY_ATTEMPTS'
  | 'INTERNAL'
  | 'BUSY';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  BAD_ORIGIN: 403,
  REAUTH_REQUIRED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PHONE_TAKEN: 409,
  INVALID_TRANSITION: 409,
  TOKEN_EXPIRED: 410,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_ATTEMPTS: 429,
  INTERNAL: 500,
  BUSY: 503,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'بعضی از مقدارها درست نیستند.',
  UNAUTHENTICATED: 'برای ادامه وارد حسابت شو.',
  INVALID_CREDENTIALS: 'موبایل یا رمز درست نیست.',
  FORBIDDEN: 'به این بخش دسترسی نداری.',
  BAD_ORIGIN: 'درخواست از مبدأ نامعتبر آمده است.',
  REAUTH_REQUIRED: 'برای این کار اول رمزت را دوباره وارد کن.',
  NOT_FOUND: 'پیدا نشد.',
  CONFLICT: 'این کار در وضعیت فعلی ممکن نیست.',
  PHONE_TAKEN: 'این شماره‌ی موبایل قبلاً ثبت شده است.',
  INVALID_TRANSITION: 'این تغییر وضعیت مجاز نیست.',
  TOKEN_EXPIRED: 'این لینک دیگر معتبر نیست. از مربی‌ات لینک تازه بخواه.',
  PAYLOAD_TOO_LARGE: 'حجم درخواست بیش از حد مجاز است.',
  UNSUPPORTED_MEDIA_TYPE: 'نوع محتوای درخواست پشتیبانی نمی‌شود.',
  TOO_MANY_ATTEMPTS: 'تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کن.',
  INTERNAL: 'خطای غیرمنتظره‌ای رخ داد. دوباره امتحان کن.',
  BUSY: 'سرور الان شلوغ است؛ چند ثانیه‌ی دیگر دوباره امتحان کن.',
};

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
    retryAfterSeconds?: number;
    /** Extra machine-readable details, e.g. `existingStudentId` of a 409 PHONE_TAKEN. */
    data?: Record<string, string>;
  };
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;
  readonly data?: Record<string, string>;

  constructor(
    code: ErrorCode,
    options: {
      message?: string;
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
      data?: Record<string, string>;
    } = {},
  ) {
    super(options.message ?? DEFAULT_MESSAGE[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
    this.fields = options.fields;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.data = options.data;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: this.retryAfterSeconds }
          : {}),
        ...(this.data ? { data: this.data } : {}),
      },
    };
  }
}

export const INVALID_REF_MESSAGE = 'مقدار نامعتبر است';

export const errors = {
  validation: (fields: Record<string, string>, message?: string) =>
    new ApiError('VALIDATION_FAILED', { fields, message }),
  unauthenticated: () => new ApiError('UNAUTHENTICATED'),
  invalidCredentials: () => new ApiError('INVALID_CREDENTIALS'),
  forbidden: () => new ApiError('FORBIDDEN'),
  /** SEC-S7 (F-06): the UI asks for the password (`POST /auth/reauth`) and retries. */
  reauthRequired: () => new ApiError('REAUTH_REQUIRED'),
  notFound: () => new ApiError('NOT_FOUND'),
  conflict: (message?: string) => new ApiError('CONFLICT', { message }),
  phoneTaken: (data?: Record<string, string>) =>
    new ApiError('PHONE_TAKEN', { fields: { phone: DEFAULT_MESSAGE.PHONE_TAKEN }, data }),
  tokenExpired: () => new ApiError('TOKEN_EXPIRED'),
  tooManyAttempts: (retryAfterSeconds: number) => {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return new ApiError('TOO_MANY_ATTEMPTS', {
      message: `تلاش‌ها زیاد بود؛ ${minutes.toLocaleString('fa-IR')} دقیقه‌ی دیگر دوباره امتحان کن.`,
      retryAfterSeconds,
    });
  },
  busy: (retryAfterSeconds: number) => new ApiError('BUSY', { retryAfterSeconds }),
};
