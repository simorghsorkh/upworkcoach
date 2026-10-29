import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AcceptTokenForm } from '@/components/auth/accept-token-form';

// Security C1 / ADR-0003 §2: the token is only in the URL fragment, never sent to the
// server; this page must not be cached, indexed, previewed or leak a Referer.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getTranslations('pageTitle'))('invite'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

/** G2 / G3 — accept an invitation (`/invite#t=…`). */
export default function Page() {
  return <AcceptTokenForm />;
}
