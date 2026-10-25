// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReauthDialog } from '@/components/auth/reauth-dialog';
import { InviteForm, InviteLinkPanel } from './invite-form';

type Reply = [number, unknown];

function mockFetch(responses: Reply[]) {
  let i = 0;
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const [status, body] = responses[Math.min(i++, responses.length - 1)] ?? [200, {}];
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const urlOf = (m: ReturnType<typeof mockFetch>, i: number) => String(m.mock.calls[i]?.[0]);
const bodyOf = (m: ReturnType<typeof mockFetch>, i: number) =>
  JSON.parse(String(m.mock.calls[i]?.[1]?.body ?? '{}')) as Record<string, unknown>;

const REAUTH: Reply = [
  403,
  { error: { code: 'REAUTH_REQUIRED', message: 'برای این کار اول رمزت را دوباره وارد کن.' } },
];
const CREATED: Reply = [
  201,
  {
    userId: 'u-1',
    inviteUrl: 'http://localhost:3100/invite#t=abc',
    expiresAt: '2026-11-01T10:00:00Z',
  },
];

beforeEach(() => {
  vi.unstubAllGlobals();
  // jsdom has no <dialog>.showModal; the Dialog only needs it to exist.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => cleanup());

function setup() {
  const user = userEvent.setup({ delay: null });
  const onCreated = vi.fn();
  render(createElement(InviteForm, { onCreated, onCancel: vi.fn() }));
  return { user, onCreated };
}

describe('InviteForm («مربی جدید»)', () => {
  it('checks name and mobile first; Persian digits are accepted and sent as Latin', async () => {
    const fetchMock = mockFetch([CREATED]);
    const { user, onCreated } = setup();
    await user.click(screen.getByRole('button', { name: 'ساخت لینک دعوت' }));
    expect(screen.getByText('نام را بنویس.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('نام'), 'رضا مشاور');
    await user.type(screen.getByLabelText('شماره‌ی موبایل'), '۰۹۱۲ ۳۴۵ ۶۷۸۹');
    await user.click(screen.getByRole('button', { name: 'ساخت لینک دعوت' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(urlOf(fetchMock, 0)).toBe('/api/v1/invitations');
    expect(bodyOf(fetchMock, 0)).toEqual({
      role: 'mentor',
      displayName: 'رضا مشاور',
      phone: '09123456789',
    });
    expect(onCreated.mock.calls[0]?.[0]).toMatchObject({
      displayName: 'رضا مشاور',
      inviteUrl: 'http://localhost:3100/invite#t=abc',
    });
  });

  it('admin role shows a warning', async () => {
    mockFetch([CREATED]);
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: 'مدیر' }));
    expect(screen.getByText(/مدیر همه‌چیز را می‌بیند/)).toBeTruthy();
  });

  it('409 PHONE_TAKEN stays next to the mobile field', async () => {
    mockFetch([[409, { error: { code: 'PHONE_TAKEN', message: 'x' } }]]);
    const { user, onCreated } = setup();
    await user.type(screen.getByLabelText('نام'), 'رضا');
    await user.type(screen.getByLabelText('شماره‌ی موبایل'), '09123456789');
    await user.click(screen.getByRole('button', { name: 'ساخت لینک دعوت' }));
    expect(await screen.findByText('این شماره قبلاً برای کاربر دیگری ثبت شده است.')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('REAUTH_REQUIRED → password dialog → reauth → the same invitation is sent again', async () => {
    const fetchMock = mockFetch([REAUTH, [200, { validUntil: 'x' }], CREATED]);
    const { user, onCreated } = setup();
    await user.type(screen.getByLabelText('نام'), 'رضا');
    await user.type(screen.getByLabelText('شماره‌ی موبایل'), '09123456789');
    await user.click(screen.getByRole('button', { name: 'ساخت لینک دعوت' }));
    const pass = await screen.findByLabelText('رمز');
    await user.type(pass, 'my-secret-pass-1');
    await user.click(screen.getByRole('button', { name: 'تأیید و ادامه' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/v1/invitations',
      '/api/v1/auth/reauth',
      '/api/v1/invitations',
    ]);
    expect(bodyOf(fetchMock, 1)).toEqual({ password: 'my-secret-pass-1' });
    expect(bodyOf(fetchMock, 2)).toEqual(bodyOf(fetchMock, 0));
  });

  it('cancelling the password dialog sends nothing more', async () => {
    const fetchMock = mockFetch([REAUTH]);
    const { user, onCreated } = setup();
    await user.type(screen.getByLabelText('نام'), 'رضا');
    await user.type(screen.getByLabelText('شماره‌ی موبایل'), '09123456789');
    await user.click(screen.getByRole('button', { name: 'ساخت لینک دعوت' }));
    const dialog = (await screen.findByLabelText('رمز')).closest('dialog') as HTMLElement;
    await user.click(within(dialog).getByRole('button', { name: 'انصراف' }));
    expect(await screen.findByText('بدون تأیید دوباره‌ی رمز، دعوت ساخته نمی‌شود.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('the link panel shows the one-time link and a Telegram message', () => {
    render(
      createElement(InviteLinkPanel, {
        link: {
          displayName: 'رضا مشاور',
          inviteUrl: 'http://localhost:3100/invite#t=abc',
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
        onDone: vi.fn(),
      }),
    );
    expect(screen.getByTestId('invite-url').textContent).toBe('http://localhost:3100/invite#t=abc');
    expect(screen.getByText(/فقط همین یک بار/)).toBeTruthy();
    expect(screen.getByText(/سلام رضا، این لینک ورود تو/)).toBeTruthy();
  });
});

describe('ReauthDialog', () => {
  function open() {
    const user = userEvent.setup({ delay: null });
    const onConfirmed = vi.fn();
    const onCancel = vi.fn();
    render(createElement(ReauthDialog, { open: true, onConfirmed, onCancel }));
    return { user, onConfirmed, onCancel };
  }

  it('empty password is refused without a request', async () => {
    const fetchMock = mockFetch([[200, {}]]);
    const { user, onConfirmed } = open();
    await user.click(screen.getByRole('button', { name: 'تأیید و ادامه' }));
    expect(screen.getByText('رمزت را بنویس.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('wrong password (422) stays in the dialog with the field message', async () => {
    mockFetch([
      [
        422,
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'x',
            fields: { password: 'رمز درست نیست.' },
          },
        },
      ],
    ]);
    const { user, onConfirmed } = open();
    await user.type(screen.getByLabelText('رمز'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'تأیید و ادامه' }));
    expect(await screen.findByText('رمز درست نیست.')).toBeTruthy();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('429 shows the wait time', async () => {
    mockFetch([
      [429, { error: { code: 'TOO_MANY_ATTEMPTS', message: 'x', retryAfterSeconds: 120 } }],
    ]);
    const { user } = open();
    await user.type(screen.getByLabelText('رمز'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'تأیید و ادامه' }));
    expect(await screen.findByText(/۲ دقیقه دیگر دوباره امتحان کن/)).toBeTruthy();
  });

  it('a correct password confirms', async () => {
    const fetchMock = mockFetch([[200, { validUntil: '2026-10-25T12:00:00Z' }]]);
    const { user, onConfirmed } = open();
    await user.type(screen.getByLabelText('رمز'), 'right-password-1');
    await user.click(screen.getByRole('button', { name: 'تأیید و ادامه' }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(urlOf(fetchMock, 0)).toBe('/api/v1/auth/reauth');
  });
});
