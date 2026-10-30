import type { Role } from '@/server/auth/current-user';

/** First page after sign-in (sitemap: staff → "Today", student → "Home"). */
export function homeFor(role: Role): string {
  return role === 'student' ? '/home' : '/today';
}

const AUTH_PAGES = /^\/(?:login|invite|reset|forgot)(?:[/?#]|$)/;

/**
 * Only same-site relative paths are accepted as a post-login destination,
 * so `?next=` can never send the user to another origin.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/')) return null;
  // "//host" and "/\host" are protocol-relative to browsers.
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  if (AUTH_PAGES.test(next)) return null;
  return next;
}
