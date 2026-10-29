import type { z } from 'zod';
import type { Locale } from '@/i18n/config';
import { formatCount, localizeText, translate } from '@/i18n/translate';
import { ApiError } from './errors';

/**
 * zod → `422 VALIDATION_FAILED` with per-field messages in the request's language (api.md
 * section 1, ADR-0013). Custom refinements in contracts carry Persian messages that are looked
 * up in the catalog; built-in issues get a generic text. Input values are never echoed (SEC-L4).
 */
export function issueMessage(issue: z.core.$ZodIssue, locale: Locale = 'fa'): string {
  const t = (key: string, params?: Record<string, string>) => translate(locale, key, params);
  switch (issue.code) {
    case 'custom':
      return localizeText(locale, issue.message);
    case 'invalid_type':
      return issue.input === undefined ? t('validation.required') : t('validation.invalid');
    case 'too_small':
      if (issue.origin === 'string') {
        return Number(issue.minimum) <= 1
          ? t('validation.required')
          : t('validation.minChars', { count: formatCount(locale, Number(issue.minimum)) });
      }
      return t('validation.invalid');
    case 'too_big':
      if (issue.origin === 'string') {
        return t('validation.maxChars', { count: formatCount(locale, Number(issue.maximum)) });
      }
      return t('validation.invalid');
    case 'unrecognized_keys':
      return t('validation.unknownField');
    default:
      return t('validation.invalid');
  }
}

export function zodFields(error: z.ZodError, locale: Locale = 'fa'): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        const path = [...issue.path, key].join('.');
        fields[path] ??= issueMessage(issue, locale);
      }
      continue;
    }
    const path = issue.path.length > 0 ? issue.path.join('.') : '_';
    fields[path] ??= issueMessage(issue, locale);
  }
  return fields;
}

export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const error = result.error;
    // Persian fields; ApiError.toBody(locale) rebuilds them in the response language.
    throw new ApiError('VALIDATION_FAILED', {
      fields: zodFields(error),
      fieldsFor: (locale) => zodFields(error, locale),
    });
  }
  return result.data;
}

/** Log-safe summary of a zod error: only path and code (SEC-L4). */
export function zodIssueSummary(error: z.ZodError): Array<{ path: string; code: string }> {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code }));
}
