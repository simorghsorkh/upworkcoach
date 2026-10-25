import { hash, parseOptions, verify } from '@node-rs/argon2';
import { phonePasswordForms } from '@/lib/phone';
import type { Role } from '@/server/auth/current-user';
import { QueueTimeoutError, Semaphore } from '@/server/concurrency';
import { errors } from '@/server/http/errors';
import { isCommonPassword } from './common-passwords';
import { normalizePassword } from './password-normalize';

/**
 * Passwords: normalisation, policy, argon2id (ADR-0003 section 3, security.md SEC-P1..P5).
 */

export { normalizePassword };

export const PASSWORD_POLICY = {
  minLength: { student: 8, staff: 12 },
  maxLength: 128,
  maxBytes: 512,
} as const;

export function minPasswordLength(role: Role): number {
  return role === 'student' ? PASSWORD_POLICY.minLength.student : PASSWORD_POLICY.minLength.staff;
}

/**
 * SEC-P2 / SEC-P3. Returns a Persian, non-judgemental message, or null when acceptable.
 * Length is measured in code points after normalisation; no composition rules (NIST).
 */
export function checkPasswordPolicy(
  raw: string,
  context: { role: Role; phone: string },
): string | null {
  const password = normalizePassword(raw);
  const length = [...password].length;
  const min = minPasswordLength(context.role);
  if (length < min) return `رمز باید دست‌کم ${min.toLocaleString('fa-IR')} نویسه باشد.`;
  if (
    length > PASSWORD_POLICY.maxLength ||
    Buffer.byteLength(password, 'utf8') > PASSWORD_POLICY.maxBytes
  ) {
    return `رمز حداکثر ${PASSWORD_POLICY.maxLength.toLocaleString('fa-IR')} نویسه می‌تواند باشد.`;
  }
  if (isCommonPassword(password)) {
    return 'این رمز خیلی رایج است و راحت حدس زده می‌شود؛ یک عبارت دیگر انتخاب کن.';
  }
  if (phonePasswordForms(context.phone).some((form) => password.includes(form))) {
    return 'رمز نباید شماره‌ی موبایلت را داشته باشد؛ یک عبارت دیگر انتخاب کن.';
  }
  return null;
}

/** SEC-P4. Stored as a PHC string so the parameters travel with the hash. */
export const ARGON2_OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (const enum; not importable with isolatedModules)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

// SEC-P5: at most 2 argon2 operations per instance; waiting more than 5 s → 503.
const argonQueue = new Semaphore(2, 5_000);
const BUSY_RETRY_AFTER_SECONDS = 5;

async function queued<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await argonQueue.run(task);
  } catch (err) {
    if (err instanceof QueueTimeoutError) throw errors.busy(BUSY_RETRY_AFTER_SECONDS);
    throw err;
  }
}

export function hashPassword(raw: string): Promise<string> {
  const normalized = normalizePassword(raw);
  return queued(() => hash(normalized, ARGON2_OPTIONS));
}

export function verifyPassword(passwordHash: string, raw: string): Promise<boolean> {
  const normalized = normalizePassword(raw);
  return queued(async () => {
    try {
      return await verify(passwordHash, normalized);
    } catch {
      return false; // malformed hash
    }
  });
}

/** True when the stored hash was made with different parameters than ARGON2_OPTIONS. */
export function needsRehash(passwordHash: string): boolean {
  try {
    const parsed = parseOptions(passwordHash);
    return (
      Number(parsed.algorithm) !== ARGON2_OPTIONS.algorithm ||
      parsed.memoryCost !== ARGON2_OPTIONS.memoryCost ||
      parsed.timeCost !== ARGON2_OPTIONS.timeCost ||
      parsed.parallelism !== ARGON2_OPTIONS.parallelism ||
      parsed.outputLen !== ARGON2_OPTIONS.outputLen
    );
  } catch {
    return true;
  }
}

// Dummy hash with the same parameters, created once per process (SEC-P5). Verified for
// unknown, invited and disabled accounts so response time does not reveal them.
let dummyHash: Promise<string> | undefined;

export function getDummyHash(): Promise<string> {
  dummyHash ??= hash(`dummy:${crypto.randomUUID()}`, ARGON2_OPTIONS);
  return dummyHash;
}

/** Spy-able hook for tests (T-AUTH: "the dummy hash is verified for unknown users"). */
export const dummyVerifier = {
  async verify(raw: string): Promise<void> {
    await verifyPassword(await getDummyHash(), raw);
  },
};
