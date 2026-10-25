// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformDTO } from '@/modules/catalog/contracts';
import type { MentorOptionDTO } from '@/modules/identity/contracts';
import { InviteReady, NewStudentForm, type NewStudentResult } from './new-student-form';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));

const ADMIN = { id: '0190f0a0-0000-7000-8000-000000000001', role: 'admin' as const };
const MENTOR_REZA: MentorOptionDTO = {
  id: '0190f0a0-0000-7000-8000-000000000002',
  displayName: 'رضا',
  role: 'mentor',
};
const UPWORK: PlatformDTO = {
  id: '0190f0a0-0000-7000-8000-0000000000aa',
  name: 'Upwork',
  trackId: null,
  sortOrder: 1,
  isActive: true,
};
const STAGES = [
  { id: '0190f0a0-0000-7000-8000-0000000000s0', name: 'شروع و تعیین سطح', displayCode: '۰' },
  { id: '0190f0a0-0000-7000-8000-0000000000s1', name: 'انتخاب نیچ', displayCode: '۱' },
];

type Reply = { status: number; body?: unknown };

function mockFetch(...replies: Reply[]) {
  const queue = [...replies];
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const reply = queue.shift() ?? { status: 500 };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof mockFetch>, call = 0) {
  const init = fetchMock.mock.calls[call]?.[1];
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
}

const created = (overrides: Partial<NewStudentResult> = {}) => ({
  student: { id: 'stu-1', displayName: 'کیمیا شریفی' },
  inviteUrl: 'http://localhost:3000/invite#t=abc123',
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  ...overrides,
});

function setup(viewer: { id: string; role: 'admin' | 'mentor' } = ADMIN) {
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(
    createElement(NewStudentForm, {
      viewer,
      mentors: [{ id: viewer.id, displayName: 'مربی', role: viewer.role }, MENTOR_REZA],
      stages: STAGES,
      platforms: [UPWORK],
      onCreated,
      onCancel,
    }),
  );
  return {
    user,
    onCreated,
    name: () => screen.getByLabelText('نام و نام خانوادگی'),
    phone: () => screen.getByLabelText('موبایل'),
    submit: () => screen.getByRole('button', { name: 'ساخت و گرفتن لینک دعوت' }),
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
});

describe('NewStudentForm (M2a)', () => {
  it('needs only name and mobile, and checks them before calling the API', async () => {
    const fetchMock = mockFetch();
    const t = setup();
    await t.user.click(t.submit());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('نام هنرجو را بنویس.')).toBeTruthy();
    expect(screen.getByText('شماره‌ی موبایل را بنویس.')).toBeTruthy();
    expect(t.name().getAttribute('aria-invalid')).toBe('true');

    await t.user.type(t.name(), 'کیمیا');
    await t.user.type(t.phone(), '۱۲۳');
    await t.user.click(t.submit());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/درست به نظر نمی‌رسد/)).toBeTruthy();
  });

  it('admin: creates with Latin digits and «خودم» as the default mentor', async () => {
    const fetchMock = mockFetch({ status: 201, body: created() });
    const t = setup();
    await t.user.type(t.name(), '  کیمیا شریفی ');
    await t.user.type(t.phone(), '۰۹۱۲ ۳۴۵ ۶۷۸۹');
    await t.user.click(t.submit());

    await waitFor(() => expect(t.onCreated).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/students');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({
      displayName: 'کیمیا شریفی',
      phone: '09123456789',
      mentorId: ADMIN.id,
    });
    expect(t.onCreated.mock.calls[0]?.[0]).toMatchObject({
      inviteUrl: created().inviteUrl,
      profileError: null,
    });
  });

  it('admin can leave the student unassigned (mentorId: null)', async () => {
    const fetchMock = mockFetch({ status: 201, body: created() });
    const t = setup();
    await t.user.type(t.name(), 'کیمیا');
    await t.user.type(t.phone(), '09123456789');
    await t.user.selectOptions(screen.getByLabelText('مشاور'), 'none');
    await t.user.click(t.submit());
    await waitFor(() => expect(t.onCreated).toHaveBeenCalled());
    expect(bodyOf(fetchMock).mentorId).toBeNull();
  });

  it('mentor: no mentor field and no mentorId in the request', async () => {
    const fetchMock = mockFetch({ status: 201, body: created() });
    const t = setup({ id: MENTOR_REZA.id, role: 'mentor' });
    expect(screen.queryByLabelText('مشاور')).toBeNull();
    await t.user.type(t.name(), 'کیمیا');
    await t.user.type(t.phone(), '09123456789');
    await t.user.click(t.submit());
    await waitFor(() => expect(t.onCreated).toHaveBeenCalled());
    expect(bodyOf(fetchMock)).not.toHaveProperty('mentorId');
  });

  it('optional details: stage, platform, tags and a showcase link saved as the primary profile', async () => {
    const fetchMock = mockFetch(
      { status: 201, body: created() },
      { status: 201, body: { id: 'p1' } },
    );
    const t = setup();
    await t.user.type(t.name(), 'کیمیا');
    await t.user.type(t.phone(), '09123456789');
    await t.user.click(screen.getByText('جزئیات بیشتر'));
    await t.user.selectOptions(
      screen.getByLabelText('مرحله‌ی فعلی (تخمین تو)'),
      STAGES[1]?.id ?? '',
    );
    await t.user.selectOptions(screen.getByLabelText('پلتفرم اصلی'), UPWORK.id);
    await t.user.type(
      screen.getByLabelText('لینک ویترین (اگر دارد)'),
      'https://www.upwork.com/freelancers/~01',
    );
    await t.user.type(screen.getByLabelText('برچسب‌ها'), 'React، کوهورت پاییز');
    await t.user.click(t.submit());

    await waitFor(() => expect(t.onCreated).toHaveBeenCalled());
    expect(bodyOf(fetchMock, 0)).toMatchObject({
      stageId: STAGES[1]?.id,
      primaryPlatformId: UPWORK.id,
      tags: ['React', 'کوهورت پاییز'],
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/students/stu-1/profiles');
    expect(bodyOf(fetchMock, 1)).toEqual({
      platformId: UPWORK.id,
      kind: 'profile',
      publicUrl: 'https://www.upwork.com/freelancers/~01',
      isPrimary: true,
    });
    // Many typed fields: give the full parallel suite room (it passes in ~2 s alone).
  });

  it('a showcase link must be https and needs its platform', async () => {
    const fetchMock = mockFetch();
    const t = setup();
    await t.user.type(t.name(), 'کیمیا');
    await t.user.type(t.phone(), '09123456789');
    await t.user.click(screen.getByText('جزئیات بیشتر'));
    await t.user.type(screen.getByLabelText('لینک ویترین (اگر دارد)'), 'http://example.com');
    await t.user.click(t.submit());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('آدرس کامل را با https بنویس.')).toBeTruthy();
    expect(screen.getByText('برای لینک ویترین، پلتفرمش را انتخاب کن.')).toBeTruthy();
  });

  it('409 PHONE_TAKEN: the message sits under the mobile field', async () => {
    mockFetch({
      status: 409,
      body: {
        error: {
          code: 'PHONE_TAKEN',
          message: 'این شماره‌ی موبایل قبلاً ثبت شده است.',
          fields: { phone: 'این شماره‌ی موبایل قبلاً ثبت شده است.' },
        },
      },
    });
    const t = setup();
    await t.user.type(t.name(), 'کیمیا');
    await t.user.type(t.phone(), '09123456789');
    await t.user.click(t.submit());
    await screen.findByText('این شماره‌ی موبایل قبلاً ثبت شده است.');
    expect(t.phone().getAttribute('aria-invalid')).toBe('true');
    expect(t.onCreated).not.toHaveBeenCalled();
  });

  it('422 per field and 403 as a form message', async () => {
    mockFetch({
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'بعضی از مقدارها درست نیستند.',
          fields: { displayName: 'نام خیلی بلند است.' },
        },
      },
    });
    const t = setup();
    await t.user.type(t.name(), 'کیمیا');
    await t.user.type(t.phone(), '09123456789');
    await t.user.click(t.submit());
    await screen.findByText('نام خیلی بلند است.');

    mockFetch({
      status: 403,
      body: { error: { code: 'FORBIDDEN', message: 'به این بخش دسترسی نداری.' } },
    });
    await t.user.click(t.submit());
    await screen.findByText('اجازه‌ی ساخت هنرجو را نداری؛ از مدیر بخواه.');
  });

  it('keeps the student when the showcase link fails, and says so', async () => {
    mockFetch(
      { status: 201, body: created() },
      {
        status: 422,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'x',
            fields: { publicUrl: 'آدرس کامل را با https بنویس.' },
          },
        },
      },
    );
    const t = setup();
    await t.user.type(t.name(), 'کیمیا');
    await t.user.type(t.phone(), '09123456789');
    await t.user.click(screen.getByText('جزئیات بیشتر'));
    await t.user.selectOptions(screen.getByLabelText('پلتفرم اصلی'), UPWORK.id);
    await t.user.type(screen.getByLabelText('لینک ویترین (اگر دارد)'), 'https://x.example');
    await t.user.click(t.submit());
    await waitFor(() => expect(t.onCreated).toHaveBeenCalled());
    expect(t.onCreated.mock.calls[0]?.[0].profileError).toBe('آدرس کامل را با https بنویس.');
  });
});

describe('InviteReady', () => {
  it('shows the one-time link with a copy button and the Telegram text', async () => {
    const user = userEvent.setup({ delay: null });
    // After setup(): user-event installs its own clipboard stub.
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const result = { ...created(), profileError: null } as unknown as NewStudentResult;
    render(createElement(InviteReady, { result, onDone: vi.fn() }));

    expect(screen.getByTestId('invite-url').textContent).toBe(result.inviteUrl);
    expect(screen.getByTestId('invite-url').getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(/سلام کیمیا، این لینک ورود تو/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'رفتن به پرونده' }).getAttribute('href')).toBe(
      '/students/stu-1',
    );

    await user.click(screen.getByRole('button', { name: 'کپی' }));
    await screen.findByText('لینک کپی شد.');
    expect(writeText).toHaveBeenCalledWith(result.inviteUrl);

    await user.click(screen.getByRole('button', { name: 'کپی متن و لینک' }));
    await screen.findByText('متن و لینک کپی شد.');
    expect(String(writeText.mock.calls[1]?.[0])).toContain(result.inviteUrl);
    expect(String(writeText.mock.calls[1]?.[0])).toContain('تا ۷ روز معتبر');
  });
});
