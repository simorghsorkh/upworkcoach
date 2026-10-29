import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { directionOf, isLocale } from '@/i18n/config';
import './globals.css';

// Vazirmatn 33.0.3 (variable, 100–900, OFL — see src/fonts/OFL.txt).
// Self-hosted and preloaded by next/font: the browser never contacts a font CDN.
const vazirmatn = localFont({
  src: '../fonts/Vazirmatn-Variable.woff2',
  variable: '--font-vazirmatn',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  fallback: ['Tahoma', 'Segoe UI', 'system-ui', 'sans-serif'],
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      default: 'UpworkCoach',
      template: '%s | UpworkCoach',
    },
    description: (await getTranslations('meta'))('description'),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  // Meta tags cannot read CSS variables: these mirror --c-bg (light / dark) in globals.css.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#141311' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The CSP set in src/proxy.ts uses a per-request nonce, which Next.js can only attach to
  // dynamically rendered pages; a prerendered page would have all its scripts blocked.
  // Waiting for the request here makes every route (including 404) render per request.
  await connection();
  // ADR-0013: language and direction from src/i18n/request.ts (user → organization → cookie).
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : 'fa';
  return (
    <html lang={locale} dir={directionOf(locale)} className={vazirmatn.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
