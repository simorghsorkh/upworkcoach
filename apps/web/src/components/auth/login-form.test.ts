// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

function mockFetch(reply: Reply) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json', ...reply.headers },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function setup(props: { next?: string | null } = {}) {
  const onSignedIn = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(createElement(LoginForm, { onSignedIn, ...props }));
  return {
    user,
    onSignedIn,
    phone: () => screen.getByLabelText('شماره‌ی موبایل'),
    password: () => screen.getByLabelText('رمز'),
    submit: () => screen.getByRole('button', { name: 'ورود' }),
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LoginForm', () => {
  it('validates both fields before calling the API', async () => {
    const fetchMock = mockFetch({ status: 200 });
    const t = setup();
    await t.user.click(t.submit());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(t.phone()).toHaveProperty('ariaInvalid', 'true');
    expect(t.password()).toHaveProperty('ariaInvalid', 'true');
    expect(screen.getByText('شماره‌ی موبایلت را بنویس.')).toBeTruthy();
    expect(screen.getByText('رمزت را بنویس.')).toBeTruthy();
    // The error is wired to the field for screen readers.
    const describedBy = t.phone().getAttribute('aria-describedby') ?? '';
    expect(describedBy).toContain(`${t.phone().id}-error`);
  });

  it('rejects an obviously wrong mobile number', async () => {
    const fetchMock = mockFetch({ status: 200 });
    const t = setup();
    await t.user.type(t.phone(), '۱۲۳');
    await t.user.type(t.password(), 'secret-pass');
    await t.user.click(t.submit());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/درست به نظر نمی‌رسد/)).toBeTruthy();
  });

  it('accepts Persian digits, sends Latin digits, and goes to the role home', async () => {
    const fetchMock = mockFetch({
      status: 200,
      body: { user: { id: 'u1', displayName: 'سارا', role: 'student', phone: '+989123456789' } },
    });
    const t = setup();
    await t.user.type(t.phone(), '۰۹۱۲ ۳۴۵ ۶۷۸۹');
    await t.user.type(t.password(), 'رمز خوب من');
    await t.user.click(t.submit());

    await waitFor(() => expect(t.onSignedIn).toHaveBeenCalledWith('/home'));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/auth/login');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      phone: '09123456789',
      password: 'رمز خوب من',
    });
  });

  it('honours a safe ?next= and ignores an external one', async () => {
    mockFetch({
      status: 200,
      body: { user: { id: 'u2', displayName: 'رضا', role: 'mentor', phone: '+989120000000' } },
    });
    const t = setup({ next: '/students' });
    await t.user.type(t.phone(), '09120000000');
    await t.user.type(t.password(), 'long-enough-pass');
    await t.user.click(t.submit());
    await waitFor(() => expect(t.onSignedIn).toHaveBeenCalledWith('/students'));

    cleanup();
    const t2 = setup({ next: '//evil.example' });
    await t2.user.type(t2.phone(), '09120000000');
    await t2.user.type(t2.password(), 'long-enough-pass');
    await t2.user.click(t2.submit());
    await waitFor(() => expect(t2.onSignedIn).toHaveBeenCalledWith('/today'));
  });

  it('shows one neutral message for 401 INVALID_CREDENTIALS', async () => {
    mockFetch({
      status: 401,
      body: { error: { code: 'INVALID_CREDENTIALS', message: 'x' } },
    });
    const t = setup();
    await t.user.type(t.phone(), '09123456789');
    await t.user.type(t.password(), 'wrong-pass');
    await t.user.click(t.submit());
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('شماره‌ی موبایل یا رمز درست نیست.'),
    );
    expect(t.onSignedIn).not.toHaveBeenCalled();
  });

  it('shows server field errors for 422', async () => {
    mockFetch({
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'چند مورد را باید درست کنی.',
          fields: { phone: 'شماره‌ی موبایل معتبر نیست' },
        },
      },
    });
    const t = setup();
    await t.user.type(t.phone(), '09123456789');
    await t.user.type(t.password(), 'whatever-pass');
    await t.user.click(t.submit());
    expect(await screen.findByText('شماره‌ی موبایل معتبر نیست')).toBeTruthy();
    expect(t.phone()).toHaveProperty('ariaInvalid', 'true');
  });

  it('locks the form on 429 and shows the wait time', async () => {
    // The wait text counts down from the wall clock; freeze it so a slow run reads the same.
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-25T10:00:00Z'));
    const fetchMock = mockFetch({
      status: 429,
      body: { error: { code: 'TOO_MANY_ATTEMPTS', message: '…' }, retryAfterSeconds: 120 },
    });
    const t = setup();
    await t.user.type(t.phone(), '09123456789');
    await t.user.type(t.password(), 'wrong-pass');
    await t.user.click(t.submit());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('ورود موقتاً بسته شد');
    expect(alert.textContent).toContain('۲ دقیقه');
    expect(t.submit().getAttribute('aria-disabled')).toBe('true');

    await t.user.click(t.submit());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads the wait time from the Retry-After header too', async () => {
    // The wait text counts down from the wall clock; freeze it so a slow run reads the same.
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-25T10:00:00Z'));
    mockFetch({
      status: 429,
      body: { error: { code: 'TOO_MANY_ATTEMPTS', message: '…' } },
      headers: { 'Retry-After': '45' },
    });
    const t = setup();
    await t.user.type(t.phone(), '09123456789');
    await t.user.type(t.password(), 'wrong-pass');
    await t.user.click(t.submit());
    expect((await screen.findByRole('alert')).textContent).toContain('۴۵ ثانیه');
  });

  it('explains a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const t = setup();
    await t.user.type(t.phone(), '09123456789');
    await t.user.type(t.password(), 'some-pass');
    await t.user.click(t.submit());
    expect((await screen.findByRole('alert')).textContent).toContain('اتصال برقرار نشد');
  });
});
