import type { Locale } from './config';
import type { Messages } from './messages';

// Typed `useTranslations` / `getTranslations` keys and locales (next-intl AppConfig).
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
