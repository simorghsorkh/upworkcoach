import { expect, type Page } from '@playwright/test';

/** RTL Persian document, no horizontal page scroll, Vazirmatn actually loaded. */
export async function expectPersianPage(page: Page) {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(html).toHaveAttribute('lang', 'fa');

  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll, 'horizontal overflow').toBeLessThanOrEqual(overflow.client);

  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter(
      (f) => /vazirmatn/i.test(f.family) && f.status === 'loaded',
    );
    return {
      loaded: loaded.length,
      bodyFamily: getComputedStyle(document.body).fontFamily,
    };
  });
  expect(font.bodyFamily.toLowerCase()).toContain('vazirmatn');
  expect(font.loaded, 'Vazirmatn font face loaded').toBeGreaterThan(0);
}

export function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1440) < 768;
}
