import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';

// Vazirmatn 33.0.3 (variable, 100–900, OFL — see src/fonts/OFL.txt).
// Self-hosted: the browser never contacts a third-party font CDN.
const vazirmatn = localFont({
  src: '../fonts/Vazirmatn-Variable.woff2',
  variable: '--font-vazirmatn',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  fallback: ['Tahoma', 'system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default: 'UpworkCoach',
    template: '%s | UpworkCoach',
  },
  description: 'دفتر مربی فریلنسری',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4A40A8',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
