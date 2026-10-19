import pino from 'pino';

/**
 * JSON logs to stdout (ADR-0002: any host can collect them; no vendor SDK).
 * Never log request bodies, tokens or passwords (overview.md section 5).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'upworkcoach-web' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
