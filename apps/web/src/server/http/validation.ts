import type { z } from 'zod';
import { errors } from './errors';

/**
 * zod → `422 VALIDATION_FAILED` with Persian per-field messages (api.md section 1).
 * Custom refinements in contracts already carry Persian messages; built-in issues get a
 * generic Persian text. Input values are never echoed (SEC-L4).
 */
export function issueMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'custom':
      return issue.message;
    case 'invalid_type':
      return issue.input === undefined ? 'این فیلد را پر کن.' : 'مقدار نامعتبر است';
    case 'too_small':
      if (issue.origin === 'string') {
        return Number(issue.minimum) <= 1
          ? 'این فیلد را پر کن.'
          : `حداقل ${Number(issue.minimum).toLocaleString('fa-IR')} نویسه لازم است.`;
      }
      return 'مقدار نامعتبر است';
    case 'too_big':
      if (issue.origin === 'string') {
        return `حداکثر ${Number(issue.maximum).toLocaleString('fa-IR')} نویسه مجاز است.`;
      }
      return 'مقدار نامعتبر است';
    case 'unrecognized_keys':
      return 'فیلد ناشناخته';
    default:
      return 'مقدار نامعتبر است';
  }
}

export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        const path = [...issue.path, key].join('.');
        fields[path] ??= issueMessage(issue);
      }
      continue;
    }
    const path = issue.path.length > 0 ? issue.path.join('.') : '_';
    fields[path] ??= issueMessage(issue);
  }
  return fields;
}

export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw errors.validation(zodFields(result.error));
  return result.data;
}

/** Log-safe summary of a zod error: only path and code (SEC-L4). */
export function zodIssueSummary(error: z.ZodError): Array<{ path: string; code: string }> {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code }));
}
