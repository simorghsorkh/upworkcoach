import { expect, test } from '@playwright/test';
import { expectPersianPage, isMobile } from './helpers';

test.describe('staff shell (/dev/shell)', () => {
  test('admin: sidebar on desktop, bottom bar with «+» on mobile', async ({ page }) => {
    const response = await page.goto('/dev/shell?role=admin');
    expect(response?.status()).toBe(200);
    await expectPersianPage(page);
    const sidebar = page.getByRole('complementary', { name: 'ناوبری اصلی' });
    const tabbar = page.getByRole('navigation', { name: 'ناوبری پایین' });

    if (isMobile(page)) {
      await expect(sidebar).toBeHidden();
      await expect(tabbar).toBeVisible();
      await expect(tabbar.getByRole('link', { name: /امروز/ })).toHaveAttribute(
        'aria-current',
        'page',
      );

      await page.getByRole('button', { name: 'افزودن سریع' }).click();
      const quick = page.getByRole('dialog', { name: 'افزودن سریع' });
      await expect(quick).toBeVisible();
      await expect(quick.getByRole('link', { name: /هنرجوی جدید/ })).toBeVisible();
      await expectPersianPage(page);
      await page.keyboard.press('Escape');
      await expect(quick).toBeHidden();

      await page.getByRole('button', { name: 'منو' }).click();
      const menu = page.getByRole('dialog', { name: 'منو' });
      await expect(menu.getByRole('link', { name: /تنظیمات/ })).toBeVisible();
      await expect(menu.getByRole('button', { name: 'خروج' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    } else {
      await expect(sidebar).toBeVisible();
      for (const label of ['امروز', 'هنرجوها', 'مراحل', 'کارها', 'سؤال‌ها', 'نتایج', 'تنظیمات']) {
        await expect(sidebar.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
      }
      await expect(sidebar.getByRole('link', { name: /^امروز/ })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(tabbar).toBeHidden();
      // RTL: the sidebar is the first grid column, i.e. flush with the right edge.
      const box = await sidebar.boundingBox();
      const width = page.viewportSize()?.width ?? 0;
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(width - 2);
    }
  });

  test('mentor: admin items are removed, not disabled', async ({ page }) => {
    await page.goto('/dev/shell?role=mentor');
    await expectPersianPage(page);
    if (isMobile(page)) {
      await page.getByRole('button', { name: 'منو' }).click();
      const menu = page.getByRole('dialog', { name: 'منو' });
      await expect(menu.getByRole('link', { name: /حساب من/ })).toBeVisible();
      await expect(menu.getByRole('link', { name: /تنظیمات/ })).toHaveCount(0);
    } else {
      const sidebar = page.getByRole('complementary', { name: 'ناوبری اصلی' });
      await expect(sidebar.getByRole('link', { name: /^هنرجوها/ })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: /^نتایج/ })).toHaveCount(0);
      await expect(sidebar.getByRole('link', { name: /^تنظیمات/ })).toHaveCount(0);
    }
  });

  test('dialog (bottom sheet on mobile) opens and closes', async ({ page }) => {
    await page.goto('/dev/shell?role=admin');
    await page.getByRole('button', { name: 'باز کردن پنجره' }).click();
    const dialog = page.getByRole('dialog', { name: 'تغییر مرحله‌ی امیر' });
    await expect(dialog).toBeVisible();
    await expectPersianPage(page);
    await dialog.getByRole('button', { name: 'بستن' }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('account (M12 / S10)', () => {
  for (const role of ['admin', 'student'] as const) {
    test(`${role}: change password, sign out, deletion only by asking the coach`, async ({
      page,
    }) => {
      await page.goto(`/dev/shell?role=${role}&view=account`);
      await expectPersianPage(page);
      await expect(page.getByRole('heading', { level: 1, name: 'حساب من' })).toBeVisible();
      await expect(page.getByLabel('رمز فعلی', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'ثبت رمز تازه' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'خروج از حساب' })).toBeVisible();
      // Security C5: guidance text, no delete button.
      await expect(page.getByText('برای حذف حساب به مربی‌ات پیام بده')).toBeVisible();
      await expect(page.getByRole('button', { name: /حذف/ })).toHaveCount(0);

      // Staff need 12 characters (ADR-0003 §3); students 8.
      await page.getByLabel('رمز فعلی', { exact: true }).fill('old-password');
      await page.getByLabel('رمز تازه', { exact: true }).fill('short-pw1');
      await page.getByLabel('تکرار رمز تازه', { exact: true }).fill('short-pw1');
      await page.route('**/api/v1/auth/change-password', (route) => route.fulfill({ status: 204 }));
      await page.getByRole('button', { name: 'ثبت رمز تازه' }).click();
      if (role === 'admin') {
        await expect(page.getByText('رمز باید دست‌کم ۱۲ نویسه باشد.')).toBeVisible();
      } else {
        await expect(page.getByText('رمزت عوض شد.', { exact: false })).toBeVisible();
      }
    });
  }
});

test.describe('student shell (/dev/shell?role=student)', () => {
  test('six destinations in the top bar (desktop), five in the bottom bar (mobile)', async ({
    page,
  }) => {
    await page.goto('/dev/shell?role=student');
    await expectPersianPage(page);
    const nav = isMobile(page)
      ? page.getByRole('navigation', { name: 'ناوبری پایین' })
      : page.getByRole('banner').getByRole('navigation', { name: 'ناوبری اصلی' });
    await expect(nav).toBeVisible();
    // Coach Office sprint 3: «برنامه‌های من» on desktop; on mobile it is reached from «مسیر من».
    await expect(nav.getByRole('link')).toHaveCount(isMobile(page) ? 5 : 6);
    await expect(nav.getByRole('link', { name: /^خانه/ })).toHaveAttribute('aria-current', 'page');
    // Students never see staff navigation.
    await expect(page.getByRole('link', { name: /^هنرجوها/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /حساب من/ })).toBeVisible();
  });
});
