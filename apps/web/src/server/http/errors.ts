import type { Locale } from '@/i18n/config';
import { messagesFor } from '@/i18n/messages';
import { formatCount, localizeText, translate } from '@/i18n/translate';

/**
 * Structured API errors (api.md section 1). `message` is Persian and safe to show to the user;
 * it never contains internal details. The response speaks the request's language (ADR-0013):
 * `toBody(locale)` translates through the message catalog.
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

// Persian texts live in messages/fa.json (errors.code), with their English twins (ADR-0013).
const DEFAULT_MESSAGE: Record<ErrorCode, string> = messagesFor('fa').errors.code;

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
  /** Catalog key of a message with parameters; otherwise `message` is looked up as fa text. */
  private readonly messageKey?: { key: string; params: Record<string, number> };
  /** Builds `fields` in another language (zod issues carry counts, e.g. «at least 3»). */
  private readonly fieldsFor?: (locale: Locale) => Record<string, string>;

  constructor(
    code: ErrorCode,
    options: {
      message?: string;
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
      data?: Record<string, string>;
      messageKey?: { key: string; params: Record<string, number> };
      fieldsFor?: (locale: Locale) => Record<string, string>;
    } = {},
  ) {
    super(options.message ?? DEFAULT_MESSAGE[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
    this.fields = options.fields;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.data = options.data;
    this.messageKey = options.messageKey;
    this.fieldsFor = options.fieldsFor;
  }

  toBody(locale: Locale = 'fa'): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.localizedMessage(locale),
        ...(this.fields ? { fields: this.localizedFields(locale, this.fields) } : {}),
        ...(this.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: this.retryAfterSeconds }
          : {}),
        ...(this.data ? { data: this.data } : {}),
      },
    };
  }

  private localizedFields(locale: Locale, fields: Record<string, string>) {
    if (locale === 'fa') return fields;
    if (this.fieldsFor) return this.fieldsFor(locale);
    return Object.fromEntries(
      Object.entries(fields).map(([name, text]) => [name, localizeText(locale, text)]),
    );
  }

  private localizedMessage(locale: Locale): string {
    if (!this.messageKey) return localizeText(locale, this.message);
    const params = Object.fromEntries(
      Object.entries(this.messageKey.params).map(([name, value]) => [
        name,
        formatCount(locale, value),
      ]),
    );
    return translate(locale, this.messageKey.key, params);
  }
}

export const INVALID_REF_MESSAGE = messagesFor('fa').validation.invalid;

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
      message: translate('fa', 'errors.tooManyAttemptsWait', {
        minutes: formatCount('fa', minutes),
      }),
      messageKey: { key: 'errors.tooManyAttemptsWait', params: { minutes } },
      retryAfterSeconds,
    });
  },
  busy: (retryAfterSeconds: number) => new ApiError('BUSY', { retryAfterSeconds }),
};
