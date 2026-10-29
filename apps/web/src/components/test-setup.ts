import { configure } from '@testing-library/dom';
import { createTranslator } from 'next-intl';
import { vi } from 'vitest';
import { messagesFor } from '@/i18n/messages';

/**
 * Component tests (jsdom) run next to the integration suite, which keeps every core busy.
 * `findBy*` / `waitFor` default to 1 s, which a fetch → state → render round trip can exceed
 * under that load even though nothing is wrong. 5 s still fails fast on a real bug.
 */
configure({ asyncUtilTimeout: 5_000 });

/**
 * Components render without a `NextIntlClientProvider` in tests: next-intl's hooks answer
 * in Persian and Tehran time, as the app does for a Persian organization (ADR-0013).
 */
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  // Stable per namespace, like the real hook: effects that depend on `t` must not rerun.
  const translators = new Map<string, unknown>();
  return {
    ...actual,
    useLocale: () => 'fa',
    useTimeZone: () => 'Asia/Tehran',
    useTranslations: (namespace?: string) => {
      const key = namespace ?? '';
      if (!translators.has(key)) {
        translators.set(
          key,
          createTranslator({ locale: 'fa', messages: messagesFor('fa'), namespace } as never),
        );
      }
      return translators.get(key);
    },
  };
});
