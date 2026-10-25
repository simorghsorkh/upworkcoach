import { expect, test } from '@playwright/test';
import { expectPersianPage } from './helpers';

test('root sends a signed-out visitor to the login page', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/);
  await expectPersianPage(page);
});
