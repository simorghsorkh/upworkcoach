// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckinForm } from './checkin-form';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
  usePathname: () => '/my/checkin',
}));

function mockFetch(responses: Array<[number, unknown]>) {
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
const bodyOf = (m: ReturnType<typeof mockFetch>, i: number) =>
  JSON.parse(String(m.mock.calls[i]?.[1]?.body ?? '{}')) as Record<string, unknown>;

const CURRENT = { weekSummary: { tasksSubmitted: 2, tasksAccepted: 1 } };
const CHECKIN = {
  id: 'c-1',
  weekStart: '2026-10-17',
  activityText: null,
  blocker: 'نمی‌دانم کدام نیچ',
  mood: 2,
  nextWeekPlan: null,
  needsHelp: true,
  questionId: 'q-9',
  submittedAt: '2026-10-21T08:00:00Z',
};

function setup() {
  const user = userEvent.setup({ delay: null });
  render(createElement(CheckinForm, { current: CURRENT, mentorName: 'رضا' }));
  return user;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});
afterEach(() => cleanup());

describe('CheckinForm (S9, user-flows §9)', () => {
  it('shows the week numbers and five questions; mood is required', async () => {
    const fetchMock = mockFetch([[201, CHECKIN]]);
    const user = setup();
    expect(screen.getByText(/۲ تحویل · ۱ کار پذیرفته/)).toBeTruthy();
    expect(screen.getByRole('group', { name: '۳. حالت چطور است؟' })).toBeTruthy();
    // Five mood buttons, each with a word (never a bare number).
    expect(screen.getByRole('radio', { name: '۱ از ۵، خیلی بد' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '۵ از ۵، عالی' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /ثبت check-in/ }));
    expect(screen.getByText('حالت را از ۱ تا ۵ انتخاب کن.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('«بله، کمک لازم دارم» needs the blocker text, then opens a question', async () => {
    const fetchMock = mockFetch([[201, CHECKIN]]);
    const user = setup();
    await user.click(screen.getByRole('radio', { name: '۲ از ۵، بد' }));
    await user.click(screen.getByRole('radio', { name: 'بله، کمک لازم دارم' }));
    expect(screen.getByText(/به‌صورت یک سؤال به رضا می‌رسد/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /ثبت check-in/ }));
    expect(screen.getByText(/بنویس کجا گیر کرده‌ای/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/بزرگ‌ترین مانع/), 'نمی‌دانم کدام نیچ');
    await user.click(screen.getByRole('button', { name: /ثبت check-in/ }));
    await waitFor(() => expect(screen.getByText('ثبت شد.')).toBeTruthy());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/me/checkins');
    expect(bodyOf(fetchMock, 0)).toEqual({
      activityText: null,
      blocker: 'نمی‌دانم کدام نیچ',
      mood: 2,
      nextWeekPlan: null,
      needsHelp: true,
    });
    expect(screen.getByRole('link', { name: 'دیدن سؤال' }).getAttribute('href')).toBe(
      '/my/questions/q-9',
    );
  });

  it('without help: optional texts may stay empty', async () => {
    const fetchMock = mockFetch([[201, { ...CHECKIN, needsHelp: false, questionId: null }]]);
    const user = setup();
    await user.click(screen.getByRole('radio', { name: '۴ از ۵، خوب' }));
    await user.type(screen.getByLabelText(/هفته‌ی بعد چه می‌کنی/), 'ده ارسال');
    await user.click(screen.getByRole('button', { name: /ثبت check-in/ }));
    await waitFor(() => expect(screen.getByText('ثبت شد.')).toBeTruthy());
    expect(bodyOf(fetchMock, 0)).toMatchObject({
      mood: 4,
      needsHelp: false,
      nextWeekPlan: 'ده ارسال',
    });
    expect(screen.queryByRole('link', { name: 'دیدن سؤال' })).toBeNull();
  });

  it('a second check-in in the same week (409) says so', async () => {
    mockFetch([[409, { error: { code: 'CONFLICT', message: 'x' } }]]);
    const user = setup();
    await user.click(screen.getByRole('radio', { name: '۳ از ۵، معمولی' }));
    await user.click(screen.getByRole('button', { name: /ثبت check-in/ }));
    expect(await screen.findByText('check-in این هفته را قبلاً فرستاده‌ای.')).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });
});
