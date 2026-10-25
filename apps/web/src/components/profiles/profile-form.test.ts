// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformDTO } from '@/modules/catalog/contracts';
import type { ProfileDTO } from '@/modules/students/contracts';
import { ProfileForm } from './profile-form';

const UPWORK: PlatformDTO = {
  id: 'pl-up',
  name: 'Upwork',
  trackId: null,
  sortOrder: 1,
  isActive: true,
};
const FIVERR: PlatformDTO = {
  id: 'pl-fv',
  name: 'Fiverr',
  trackId: null,
  sortOrder: 2,
  isActive: true,
};

const EXISTING: ProfileDTO = {
  id: 'prof-1',
  platform: { id: UPWORK.id, name: 'Upwork' },
  kind: 'profile',
  publicUrl: 'https://www.upwork.com/freelancers/~01abc',
  headline: 'Shopify Speed Expert',
  rateAmount: '25.00',
  rateCurrency: 'USD',
  rateUnit: 'hour',
  status: 'active',
  niche: null,
  notes: null,
  isPrimary: true,
  mentorApprovedAt: null,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
};

function mockFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof mockFetch>) {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}')) as Record<string, unknown>;
}

function setup(props: { mode?: 'staff' | 'student'; profile?: ProfileDTO } = {}) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(
    createElement(ProfileForm, {
      mode: props.mode ?? 'staff',
      createUrl: '/api/v1/students/stu-1/profiles',
      platforms: [UPWORK, FIVERR],
      profile: props.profile,
      onSaved,
      onCancel,
    }),
  );
  return {
    user,
    onSaved,
    onCancel,
    url: () => screen.getByLabelText(/لینک عمومی/),
    submit: () =>
      screen.getByRole('button', { name: props.profile ? 'ذخیره‌ی تغییرات' : 'افزودن ویترین' }),
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
});

describe('ProfileForm (F2, security rule 8)', () => {
  it('has no password field and always warns not to type one', () => {
    setup();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByLabelText(/رمز/)).toBeNull();
    expect(screen.getByText(/رمز یا کد ورود هیچ حسابی را این‌جا ننویس/)).toBeTruthy();
  });

  it('staff mode says the student sees the notes (SEC-F6); student mode says the mentor does', () => {
    setup({ mode: 'staff' });
    expect(screen.getByText(/هنرجو این را می‌بیند/)).toBeTruthy();
    cleanup();
    setup({ mode: 'student' });
    expect(screen.getByText('مشاورت هم این را می‌بیند.')).toBeTruthy();
  });

  it('rejects a non-https link before calling the API', async () => {
    const fetchMock = mockFetch(201, {});
    const t = setup();
    await t.user.type(t.url(), 'http://www.upwork.com/freelancers/~01');
    await t.user.click(t.submit());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('آدرس کامل را با https بنویس.')).toBeTruthy();
    expect(t.url().getAttribute('aria-invalid')).toBe('true');
    expect(t.url().getAttribute('dir')).toBe('ltr');
  });

  it('creates with only the filled fields; Persian digits and currency are normalised', async () => {
    const fetchMock = mockFetch(201, { ...EXISTING, id: 'new' });
    const t = setup();
    await t.user.selectOptions(screen.getByLabelText('پلتفرم'), FIVERR.id);
    await t.user.selectOptions(screen.getByLabelText('نوع'), 'gig');
    await t.user.type(t.url(), 'https://www.fiverr.com/kimia/logo');
    await t.user.type(screen.getByLabelText('مبلغ'), '۲۵٫۵');
    await t.user.clear(screen.getByLabelText('ارز'));
    await t.user.type(screen.getByLabelText('ارز'), 'eur');
    await t.user.selectOptions(screen.getByLabelText('واحد'), 'package');
    await t.user.click(screen.getByLabelText('ویترین اصلی'));
    await t.user.click(t.submit());

    await waitFor(() => expect(t.onSaved).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/students/stu-1/profiles');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(sent(fetchMock)).toEqual({
      platformId: FIVERR.id,
      kind: 'gig',
      publicUrl: 'https://www.fiverr.com/kimia/logo',
      status: 'building',
      rateAmount: '25.5',
      rateCurrency: 'EUR',
      rateUnit: 'package',
      isPrimary: true,
    });
  });

  it('shows a 422 field message from the server next to the field', async () => {
    mockFetch(422, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'بعضی از مقدارها درست نیستند.',
        fields: { headline: 'حداکثر ۲۰۰ نویسه مجاز است.' },
      },
    });
    const t = setup();
    await t.user.type(screen.getByLabelText(/تیتر/), 'x');
    await t.user.click(t.submit());
    await screen.findByText('حداکثر ۲۰۰ نویسه مجاز است.');
    expect(screen.getByLabelText(/تیتر/).getAttribute('aria-invalid')).toBe('true');
    expect(t.onSaved).not.toHaveBeenCalled();
  });

  it('edit: PATCH with only the changed fields and ifUpdatedAt; clearing sends null', async () => {
    const fetchMock = mockFetch(200, { ...EXISTING, headline: null, status: 'restricted' });
    const t = setup({ profile: EXISTING });
    expect((screen.getByLabelText('مبلغ') as HTMLInputElement).value).toBe('25');
    await t.user.clear(screen.getByLabelText(/تیتر/));
    await t.user.selectOptions(screen.getByLabelText('وضعیت'), 'restricted');
    await t.user.click(t.submit());

    await waitFor(() => expect(t.onSaved).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/profiles/prof-1');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(sent(fetchMock)).toEqual({
      headline: null,
      status: 'restricted',
      ifUpdatedAt: EXISTING.updatedAt,
    });
  });

  it('edit without changes closes without a request', async () => {
    const fetchMock = mockFetch(200, EXISTING);
    const t = setup({ profile: EXISTING });
    await t.user.click(t.submit());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(t.onCancel).toHaveBeenCalled();
  });

  it('409 and 404 on edit become clear messages', async () => {
    mockFetch(409, { error: { code: 'CONFLICT', message: 'x' } });
    const t = setup({ profile: EXISTING });
    await t.user.selectOptions(screen.getByLabelText('وضعیت'), 'suspended');
    await t.user.click(t.submit());
    await screen.findByText(/کس دیگری همین حالا این ویترین را تغییر داد/);

    mockFetch(404, { error: { code: 'NOT_FOUND', message: 'پیدا نشد.' } });
    await t.user.click(t.submit());
    await screen.findByText(/این ویترین دیگر وجود ندارد/);
  });
});
