import { expect, test } from '@playwright/test';
import { expectPersianPage } from './helpers';

test.describe('login (G1)', () => {
  test('renders RTL with labelled fields and validates on the client', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.status()).toBe(200);
    await expectPersianPage(page);

    await expect(page.getByRole('heading', { level: 1, name: 'ورود' })).toBeVisible();
    const phone = page.getByLabel('شماره‌ی موبایل');
    await expect(phone).toHaveAttribute('dir', 'ltr');
    await expect(phone).toHaveAttribute('autocomplete', 'username');
    await expect(phone).toHaveAttribute('inputmode', 'tel');
    await expect(page.getByLabel('رمز', { exact: true })).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'ورود' }).click();
    await expect(page.getByText('شماره‌ی موبایلت را بنویس.')).toBeVisible();
    await expect(phone).toHaveAttribute('aria-invalid', 'true');
    await expect(phone).toBeFocused();
    await expectPersianPage(page);
  });

  test('links to the forgot-password guidance', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'رمزت را فراموش کرده‌ای؟' }).click();
    await expect(page).toHaveURL(/\/forgot$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('رمزت را فراموش کرده‌ای؟');
    await expectPersianPage(page);
  });
});

test.describe('invite / reset (G2, G3)', () => {
  test('a link without a token shows the invalid-link state', async ({ page }) => {
    await page.goto('/invite');
    await expect(
      page.getByRole('heading', { level: 1, name: 'این لینک دیگر کار نمی‌کند' }),
    ).toBeVisible();
    await expectPersianPage(page);
  });

  test('the token leaves the address bar and is sent only in the POST body', async ({ page }) => {
    const seen: Array<{ url: string; body: string | null }> = [];
    await page.route('**/api/v1/auth/**', async (route) => {
      const req = route.request();
      seen.push({ url: req.url(), body: req.postData() });
      if (req.url().endsWith('/tokens/lookup')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            purpose: 'invite',
            displayName: 'سارا',
            expiresAt: '2026-10-26T08:00:00Z',
          }),
        });
      }
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/invite#t=secret-token-123');
    await expect(page.getByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible();
    expect(page.url()).not.toContain('secret-token-123');
    const lookup = seen.find((s) => s.url.endsWith('/tokens/lookup'));
    expect(lookup?.url).not.toContain('secret');
    expect(JSON.parse(lookup?.body ?? '{}')).toEqual({ token: 'secret-token-123' });
    await expect(page.getByLabel('شماره‌ی موبایلت')).toHaveValue('');
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    await expectPersianPage(page);
  });
});
