import type { ReactNode } from 'react';
import { Icon } from '@/components/icons/icon';
import { cn } from './cn';

/**
 * English Upwork content (design-system §7, mockups §16 `.ltr-block`): its own LTR block,
 * isolated from the Persian sentence around it, with a light start border.
 */
export function LtrBlock({
  compact,
  className,
  children,
}: {
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      dir="ltr"
      lang="en"
      className={cn(
        'rounded-sm border border-s-[3px] border-line border-s-brand-300 bg-bg text-start text-fg [overflow-wrap:anywhere] [unicode-bidi:isolate]',
        compact
          ? 'px-2.5 py-1.5 text-sm leading-[1.6]'
          : 'px-4 py-3 text-ui leading-[1.7] whitespace-pre-wrap',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** «upwork.com/freelancers/~01ab…» — host + path, no scheme or `www.` (SEC-X6: the destination is visible). */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}`.replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return url;
  }
}

/**
 * A student-provided link (SEC-X6): opens in a new tab without referrer or opener, shows the
 * destination domain, keeps the full address in the tooltip. The system never fetches it.
 */
export function ExternalLink({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      dir="ltr"
      className={cn(
        'inline-flex max-w-full items-center gap-1 text-sm text-link [unicode-bidi:isolate] hover:underline',
        className,
      )}
    >
      <span className="min-w-0 truncate">{displayUrl(href)}</span>
      <Icon name="external" size={14} className="flex-none" />
      <span className="sr-only">(در صفحه‌ی جدید باز می‌شود)</span>
    </a>
  );
}
