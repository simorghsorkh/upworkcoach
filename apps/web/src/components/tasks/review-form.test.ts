// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { FEEDBACK_TEMPLATE } from './labels';
import { ReviewForm } from './review-form';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  usePathname: () => '/tasks/t-1',
}));

function mockFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function setup(nextHref: string | null = '/tasks/t-2') {
  const user = userEvent.setup({ delay: null });
  render(
    createElement(
      ToastProvider,
      null,
      createElement(ReviewForm, {
        submissionId: 'sub-4',
        version: 4,
        studentFirstName: 'امیر',
        nextHref,
      }),
    ),
  );
  return { user, feedback: () => screen.getByLabelText(/بازخورد/) as HTMLTextAreaElement };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  refresh.mockClear();
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe('ReviewForm (M6)', () => {
  it('starts with the mentor template and says the student will see it (SEC-F6)', () => {
    const t = setup();
    expect(t.feedback().value).toBe(FEEDBACK_TEMPLATE);
    expect(screen.getByText('هنرجو این را می‌بیند')).toBeTruthy();
    expect(screen.getByText('نسخه‌ی ۵ را می‌فرستد')).toBeTruthy();
  });

  it('needs an outcome and real feedback (the bare template is not feedback)', async () => {
    const fetchMock = mockFetch(201, {});
    const t = setup();
    await t.user.click(screen.getByRole('button', { name: /ثبت بازبینی/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('نتیجه را انتخاب کن: پذیرفته یا نیاز به اصلاح.')).toBeTruthy();
    expect(screen.getByText('بازخورد را بنویس.')).toBeTruthy();
  });

  it('requests changes with feedback and score, then goes to the next review', async () => {
    const fetchMock = mockFetch(201, { id: 't-1' });
    const t = setup();
    await t.user.click(screen.getByRole('radio', { name: /نیاز به اصلاح/ }));
    await t.user.clear(t.feedback());
    await t.user.type(t.feedback(), 'حکم: اصلاح جزئی{enter}قدم بعدی: نسخه‌ی ۵');
    await t.user.click(screen.getByRole('radio', { name: /۳ از ۵/ }));
    await t.user.click(screen.getByRole('button', { name: /ثبت بازبینی و رفتن به بعدی/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/tasks/t-2'));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/submissions/sub-4/review');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      outcome: 'changes_requested',
      feedbackText: 'حکم: اصلاح جزئی\nقدم بعدی: نسخه‌ی ۵',
      score: 3,
    });
    expect(await screen.findByText(/بازخورد برای امیر رفت/)).toBeTruthy();
  });

  it('accepts without a score; a second click clears the score', async () => {
    const fetchMock = mockFetch(201, { id: 't-1' });
    const t = setup(null);
    await t.user.click(screen.getByRole('radio', { name: /پذیرفته/ }));
    await t.user.clear(t.feedback());
    await t.user.type(t.feedback(), 'عالی بود.');
    const five = screen.getByRole('radio', { name: /۵ از ۵/ });
    await t.user.click(five);
    await t.user.click(five);
    await t.user.click(screen.getByRole('button', { name: /ثبت بازبینی/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      outcome: 'accepted',
      feedbackText: 'عالی بود.',
    });
  });

  it('keeps the draft on this device and shows a 409 as a form error', async () => {
    mockFetch(409, {
      error: { code: 'INVALID_TRANSITION', message: 'این کار منتظر بازبینی نیست.' },
    });
    const t = setup();
    await t.user.click(screen.getByRole('radio', { name: /پذیرفته/ }));
    await t.user.clear(t.feedback());
    await t.user.type(t.feedback(), 'پیش‌نویس من');
    await t.user.click(screen.getByRole('button', { name: 'ذخیره‌ی پیش‌نویس' }));
    expect(JSON.parse(window.localStorage.getItem('uc:review-draft:sub-4') ?? '{}').feedback).toBe(
      'پیش‌نویس من',
    );
    await t.user.click(screen.getByRole('button', { name: /ثبت بازبینی/ }));
    expect(await screen.findByText(/این کار منتظر بازبینی نیست/)).toBeTruthy();
    expect(window.localStorage.getItem('uc:review-draft:sub-4')).not.toBeNull();
  });
});
