import { expect, test } from '@playwright/test';

test('home page renders right-to-left Persian without horizontal overflow', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);

  const html = page.locator('html');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(html).toHaveAttribute('lang', 'fa');

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
