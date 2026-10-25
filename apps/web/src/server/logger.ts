import pino from 'pino';

/**
 * JSON logs to stdout (ADR-0002: any host can collect them; no vendor SDK).
 * Never log request bodies, tokens or passwords (overview.md section 5).
 */
const SQLSTATE = /^[0-9A-Z]{5}$/;

type PgDetails = { code: string; constraint?: string; table?: string };

/** SQLSTATE, constraint and table of a pg error (never `detail`, which quotes the values). */
function pgDetails(value: unknown): PgDetails | null {
  if (!value || typeof value !== 'object') return null;
  const { code, constraint, table } = value as {
    code?: unknown;
    constraint?: unknown;
    table?: unknown;
  };
  if (typeof code !== 'string' || !SQLSTATE.test(code)) return null;
  return {
    code,
    ...(typeof constraint === 'string' ? { constraint } : {}),
    ...(typeof table === 'string' ? { table } : {}),
  };
}

function isDatabaseError(err: Error): boolean {
  return (
    err.name === 'DrizzleQueryError' ||
    'params' in err ||
    'query' in err ||
    pgDetails(err) !== null ||
    pgDetails((err as { cause?: unknown }).cause) !== null
  );
}

/**
 * Safe log form of an error (SEC-L2/L4, followup F-17). A database error (Drizzle's
 * `DrizzleQueryError` carries the SQL and EVERY bound parameter — phones, note text,
 * password hashes — in its message, and pg's `detail` quotes values) is reduced to its type,
 * SQLSTATE code, constraint and table: no message, parameters, `detail` or stack.
 * Other errors keep message and stack.
 */
export function safeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { type: typeof err };
  if (isDatabaseError(err)) {
    const pg = pgDetails(err) ?? pgDetails((err as { cause?: unknown }).cause);
    return { type: err.name, database: true, ...(pg ?? {}) };
  }
  return { type: err.name, message: err.message, stack: err.stack };
}

/** F-17: `{ err }` / `{ error }` fields never reach the output with query parameters. */
export const logSerializers = {
  err: safeError,
  error: (value: unknown) => (value instanceof Error ? safeError(value) : value),
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'upworkcoach-web' },
  timestamp: pino.stdTimeFunctions.isoTime,
  // F-17: `{ err }` / `{ error }` objects never reach the output with query parameters.
  serializers: logSerializers,
  // SEC-L1. Never log bodies; these paths are a safety net for accidental objects.
  redact: {
    paths: [
      'password',
      'currentPassword',
      'newPassword',
      'token',
      'inviteUrl',
      'resetUrl',
      'setupUrl',
      'passwordHash',
      'tokenHash',
      'authorization',
      'cookie',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.inviteUrl',
      '*.resetUrl',
      '*.setupUrl',
      '*.passwordHash',
      '*.tokenHash',
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-job-secret"]',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
