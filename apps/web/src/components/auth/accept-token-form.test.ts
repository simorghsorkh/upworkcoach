// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcceptTokenForm, validateNewPassword } from './accept-token-form';

type Reply = { status: number; body?: unknown };
type Routes = Partial<Record<'lookup' | 'accept' | 'me', Reply | Reply[]>>;

/** Fake API keyed by endpoint; an array answers successive calls in order. */
function mockApi(routes: Routes) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const counters: Record<string, number> = {};
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = url.endsWith('/tokens/lookup')
      ? 'lookup'
      : url.endsWith('/tokens/accept')
        ? 'accept'
        : url.endsWith('/auth/me')
          ? 'me'
          : null;
    const route = key ? routes[key] : undefined;
    const n = (counters[key ?? ''] ?? 0) + 1;
    counters[key ?? ''] = n;
    const reply: Reply = Array.isArray(route)
      ? (route[n - 1] ?? route[route.length - 1] ?? { status: 500 })
      : (route ?? { status: key === 'me' ? 401 : 500 });
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

const lookupOk: Reply = {
  status: 200,
  body: { purpose: 'invite', displayName: 'سارا', expiresAt: '2026-10-26T08:00:00Z' },
};
const gone: Reply = { status: 410, body: { error: { code: 'TOKEN_EXPIRED', message: '…' } } };

function openAt(hash: string) {
  window.history.replaceState(null, '', `/invite${hash}`);
  const onAccepted = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(createElement(AcceptTokenForm, { onAccepted }));
  return { user, onAccepted };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { phone, password, confirm }: { phone: string; password: string; confirm: string },
) {
  if (phone) await user.type(screen.getByLabelText('شماره‌ی موبایلت'), phone);
  if (password) await user.type(screen.getByLabelText('رمز'), password);
  if (confirm) await user.type(screen.getByLabelText('تکرار رمز'), confirm);
  await user.click(screen.getByRole('button', { name: 'ثبت رمز و ورود' }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
});

describe('AcceptTokenForm (security C1)', () => {
  it('shows the invalid-link state when the fragment has no token', async () => {
    const { calls } = mockApi({});
    openAt('');
    expect(await screen.findByRole('heading', { name: 'این لینک دیگر کار نمی‌کند' })).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith('/tokens/lookup'))).toBe(false);
  });

  it('reads the token from #t=, removes it from the URL and looks it up via POST body', async () => {
    const { calls } = mockApi({ lookup: lookupOk });
    openAt('#t=tok_123');
    expect(await screen.findByRole('heading', { name: 'سلام سارا' })).toBeTruthy();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('tok_123');
    const lookup = calls.find((c) => c.url === '/api/v1/auth/tokens/lookup');
    expect(lookup?.body).toEqual({ token: 'tok_123' });
    // The mobile number is never pre-filled or masked.
    expect((screen.getByLabelText('شماره‌ی موبایلت') as HTMLInputElement).value).toBe('');
  });

  it('shows the invalid-link state for 410 TOKEN_EXPIRED on lookup', async () => {
    mockApi({ lookup: gone });
    openAt('#t=old');
    expect(await screen.findByRole('heading', { name: 'این لینک دیگر کار نمی‌کند' })).toBeTruthy();
  });

  it('validates phone, length and confirmation before calling accept', async () => {
    const { calls } = mockApi({ lookup: lookupOk });
    const { user } = openAt('#t=tok');
    await screen.findByRole('heading', { name: 'سلام سارا' });

    await fill(user, { phone: '', password: 'کوتاه', confirm: '' });
    expect(screen.getByText('شماره‌ی موبایلت را بنویس.')).toBeTruthy();
    expect(screen.getByText(/دست‌کم ۸ نویسه باشد/)).toBeTruthy();

    await user.type(screen.getByLabelText('شماره‌ی موبایلت'), '09123456789');
    await user.clear(screen.getByLabelText('رمز'));
    await user.type(screen.getByLabelText('رمز'), 'a-long-password');
    await user.type(screen.getByLabelText('تکرار رمز'), 'a-different-one');
    await user.click(screen.getByRole('button', { name: 'ثبت رمز و ورود' }));
    expect(screen.getByText('تکرار رمز با خود رمز یکی نیست.')).toBeTruthy();

    expect(calls.some((c) => c.url.endsWith('/tokens/accept'))).toBe(false);
  });

  it('sends token, Latin-digit phone and password in the body, then signs in', async () => {
    const { calls } = mockApi({
      lookup: lookupOk,
      accept: {
        status: 200,
        body: { user: { id: 'u1', displayName: 'سارا', role: 'student', phone: '+989123456789' } },
      },
    });
    const { user, onAccepted } = openAt('#t=tok_abc');
    await screen.findByRole('heading', { name: 'سلام سارا' });
    await fill(user, {
      phone: '۰۹۱۲۳۴۵۶۷۸۹',
      password: 'رمز تازه‌ی من',
      confirm: 'رمز تازه‌ی من',
    });

    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith('/home'));
    const accept = calls.find((c) => c.url === '/api/v1/auth/tokens/accept');
    expect(accept?.body).toEqual({
      token: 'tok_abc',
      phone: '09123456789',
      password: 'رمز تازه‌ی من',
    });
  });

  it('shows the phone mismatch from 422 on the phone field', async () => {
    mockApi({
      lookup: lookupOk,
      accept: {
        status: 422,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: '…',
            fields: { phone: 'این شماره با این لینک هم‌خوانی ندارد' },
          },
        },
      },
    });
    const { user, onAccepted } = openAt('#t=tok');
    await screen.findByRole('heading', { name: 'سلام سارا' });
    await fill(user, {
      phone: '09120000000',
      password: 'a-long-password',
      confirm: 'a-long-password',
    });

    expect(await screen.findByText('این شماره با این لینک هم‌خوانی ندارد')).toBeTruthy();
    expect(screen.getByLabelText('شماره‌ی موبایلت')).toHaveProperty('ariaInvalid', 'true');
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('switches to the invalid-link state when accept answers 410', async () => {
    mockApi({ lookup: lookupOk, accept: gone });
    const { user } = openAt('#t=tok');
    await screen.findByRole('heading', { name: 'سلام سارا' });
    await fill(user, {
      phone: '09123456789',
      password: 'a-long-password',
      confirm: 'a-long-password',
    });
    expect(await screen.findByRole('heading', { name: 'این لینک دیگر کار نمی‌کند' })).toBeTruthy();
  });

  it('warns when the browser is signed in with another account', async () => {
    mockApi({
      lookup: lookupOk,
      me: { status: 200, body: { id: 'm1', displayName: 'مربی', role: 'admin', phone: '+98912' } },
    });
    openAt('#t=tok');
    expect(await screen.findByText('الان با حساب دیگری وارد شده‌ای.')).toBeTruthy();
  });

  it('uses the reset wording for password_reset links', async () => {
    mockApi({
      lookup: {
        status: 200,
        body: { purpose: 'password_reset', displayName: 'رضا', expiresAt: '2026-10-21T08:00:00Z' },
      },
    });
    openAt('#t=tok');
    expect(await screen.findByRole('heading', { name: 'رمز تازه بگذار' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ثبت رمز تازه و ورود' })).toBeTruthy();
  });
});

describe('validateNewPassword', () => {
  it('counts characters, not UTF-16 units, and honours the staff minimum', () => {
    expect(validateNewPassword('۱۲۳۴۵۶۷۸', '۱۲۳۴۵۶۷۸')).toEqual({});
    expect(validateNewPassword('12345678', '12345678', 12).password).toContain('۱۲');
    expect(validateNewPassword('abcdefgh', 'abcdefgx').confirm).toBeDefined();
  });
});
