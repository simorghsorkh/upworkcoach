import { z } from 'zod';

/**
 * Environment contract — docs/04-architecture/tech-stack.md section 5.
 * Read lazily through getEnv() so `next build` never needs runtime secrets.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// URL'),
    APP_BASE_URL: z.url().default('http://localhost:3000'),
    SESSION_COOKIE_NAME: z.string().min(1).default('__Host-uc_session'),
    // ADR-0003: HMAC key for the trusted-device cookie (login lockout policy). Required in production.
    DEVICE_COOKIE_SECRET: z.string().min(32).optional(),
    // ADR-0003: number of trusted proxies in front of the app for X-Forwarded-For (local 0, App Service 1).
    // F-18: required in production (a missing value would silently mean 0 = every login
    // lock keyed on the proxy's IP); elsewhere it defaults to 0.
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
    // F-08: build identifier shown by /healthz (e.g. the commit SHA). Optional; 'dev' when unset.
    APP_VERSION: z
      .string()
      .regex(/^[\w.+-]{1,64}$/)
      .optional(),

    STORAGE_DRIVER: z.enum(['local', 'azure-blob', 's3', 'supabase']).default('local'),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_STORAGE_BUCKET: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
      .default('uploads'),
    LOCAL_STORAGE_DIR: z.string().min(1).default('.data/uploads'),
    AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
    AZURE_STORAGE_CONTAINER: z.string().optional(),
    S3_ENDPOINT: z.url().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_REGION: z.string().optional(),

    // `worker-only` is reserved for 1.0 (ADR-0007).
    JOBS_MODE: z.enum(['in-process', 'http-trigger', 'off']).default('in-process'),
    JOB_TRIGGER_SECRET: z.string().min(32).optional(),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5_242_880),
  })
  .superRefine((env, ctx) => {
    const requireFor = (condition: boolean, keys: (keyof typeof env)[], reason: string) => {
      if (!condition) return;
      for (const key of keys) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `required ${reason}` });
      }
    };
    requireFor(env.NODE_ENV === 'production', ['DEVICE_COOKIE_SECRET'], 'in production');
    // F-18: 0 is a valid value, so check presence rather than truthiness.
    if (env.NODE_ENV === 'production' && env.TRUSTED_PROXY_HOPS === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUSTED_PROXY_HOPS'],
        message: 'required in production (1 on App Service)',
      });
    }
    // SEC-S8: production cookies are `__Host-` + Secure, which needs https.
    if (env.NODE_ENV === 'production' && !env.APP_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_BASE_URL'],
        message: 'must be https:// in production',
      });
    }
    requireFor(
      env.STORAGE_DRIVER === 'azure-blob',
      ['AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_CONTAINER'],
      'when STORAGE_DRIVER=azure-blob',
    );
    requireFor(
      env.STORAGE_DRIVER === 'supabase',
      ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      'when STORAGE_DRIVER=supabase',
    );
    requireFor(
      env.STORAGE_DRIVER === 's3',
      ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'],
      'when STORAGE_DRIVER=s3',
    );
    requireFor(
      env.JOBS_MODE === 'http-trigger',
      ['JOB_TRIGGER_SECRET'],
      'when JOBS_MODE=http-trigger',
    );
  })
  .transform((env) => ({ ...env, TRUSTED_PROXY_HOPS: env.TRUSTED_PROXY_HOPS ?? 0 }));

export type Env = z.infer<typeof envSchema>;

type EnvSource = Record<string, string | undefined>;

/** Empty values in .env files (`KEY=`) mean "not set". */
function withoutEmptyValues(source: EnvSource): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== ''),
  );
}

export function parseEnv(source: EnvSource): Env {
  const result = envSchema.safeParse(withoutEmptyValues(source));
  if (!result.success) {
    // Only variable names and messages are printed, never values.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
