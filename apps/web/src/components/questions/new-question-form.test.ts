// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { NewQuestionForm } from './new-question-form';
import { ReplyForm } from './reply-form';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/my/questions/new',
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

const TASK = { id: '0193a0a0-0000-7000-8000-000000000001', title: 'تحلیل ۳ رقیب' };

beforeEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  refresh.mockClear();
});
afterEach(() => cleanup());

describe('NewQuestionForm (F8, S5)', () => {
  it('shows the expected response time and the red lines; refuses an empty question', async () => {
    const fetchMock = mockFetch([[201, {}]]);
    const user = userEvent.setup({ delay: null });
    render(createElement(NewQuestionForm, { expectedResponseText: 'معمولاً تا ۲۴ ساعت' }));
    expect(screen.getByText('معمولاً تا ۲۴ ساعت جواب می‌گیری.')).toBeTruthy();
    expect(screen.getByText(/خرید یا اجاره‌ی اکانت/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'فرستادن سؤال' }));
    expect(screen.getByText('موضوع سؤال را بنویس.')).toBeTruthy();
    expect(screen.getByText('سؤالت را کامل‌تر بنویس.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-https link before sending', async () => {
    const fetchMock = mockFetch([[201, {}]]);
    const user = userEvent.setup({ delay: null });
    render(createElement(NewQuestionForm, { expectedResponseText: 'معمولاً تا ۲۴ ساعت' }));
    await user.type(screen.getByLabelText('موضوع'), 'نرخ اولیه');
    await user.type(screen.getByLabelText('سؤالت'), '۱۵ دلار کم نیست؟');
    await user.type(screen.getByLabelText(/لینک/), 'http://example.com');
    await user.click(screen.getByRole('button', { name: 'فرستادن سؤال' }));
    expect(screen.getByText('آدرس کامل را با https بنویس.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends subject, body, task and urgency, then opens the thread', async () => {
    const fetchMock = mockFetch([[201, { id: 'q-1' }]]);
    const user = userEvent.setup({ delay: null });
    render(
      createElement(NewQuestionForm, { expectedResponseText: 'معمولاً تا ۲۴ ساعت', task: TASK }),
    );
    expect((screen.getByLabelText('موضوع') as HTMLInputElement).value).toBe(
      'درباره‌ی «تحلیل ۳ رقیب»',
    );
    await user.type(screen.getByLabelText('سؤالت'), 'رقیب سوم را از کجا پیدا کنم؟');
    await user.click(screen.getByRole('checkbox', { name: 'فوری است' }));
    await user.click(screen.getByRole('button', { name: 'فرستادن سؤال' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/my/questions/q-1?sent=1'));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/me/questions');
    expect(bodyOf(fetchMock, 0)).toEqual({
      subject: 'درباره‌ی «تحلیل ۳ رقیب»',
      body: 'رقیب سوم را از کجا پیدا کنم؟',
      taskId: TASK.id,
      priority: 'urgent',
    });
  });

  it('«وقت بیشتری لازم دارم» is a question with a fixed subject (staff extend, not students)', async () => {
    const fetchMock = mockFetch([[201, { id: 'q-2' }]]);
    const user = userEvent.setup({ delay: null });
    render(
      createElement(NewQuestionForm, {
        expectedResponseText: 'معمولاً تا ۲۴ ساعت',
        task: TASK,
        kind: 'extension',
      }),
    );
    const subject = screen.getByLabelText('موضوع') as HTMLInputElement;
    expect(subject.value).toBe('درخواست تمدید مهلت');
    expect(subject.readOnly).toBe(true);
    await user.click(screen.getByRole('button', { name: 'فرستادن درخواست' }));
    expect(screen.getByText('بنویس چقدر وقت بیشتر لازم داری و چرا.')).toBeTruthy();
    await user.type(screen.getByLabelText(/چقدر وقت بیشتر/), '۳ روز؛ امتحان دارم');
    await user.click(screen.getByRole('button', { name: 'فرستادن درخواست' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(bodyOf(fetchMock, 0)).toMatchObject({
      subject: 'درخواست تمدید مهلت',
      taskId: TASK.id,
    });
  });

  it('maps 422 field errors next to the field and keeps the text', async () => {
    mockFetch([
      [
        422,
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'x',
            fields: { subject: 'موضوع خیلی بلند است.' },
          },
        },
      ],
    ]);
    const user = userEvent.setup({ delay: null });
    render(createElement(NewQuestionForm, { expectedResponseText: 'معمولاً تا ۲۴ ساعت' }));
    await user.type(screen.getByLabelText('موضوع'), 'موضوع');
    await user.type(screen.getByLabelText('سؤالت'), 'متن سؤال');
    await user.click(screen.getByRole('button', { name: 'فرستادن سؤال' }));
    expect(await screen.findByText('موضوع خیلی بلند است.')).toBeTruthy();
    expect((screen.getByLabelText('سؤالت') as HTMLTextAreaElement).value).toBe('متن سؤال');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('ReplyForm (staff answer)', () => {
  const RED = {
    id: '0193a0a0-0000-7000-8000-0000000000c1',
    title: 'خرید اکانت',
    body: 'ما در خرید یا اجاره‌ی اکانت کمک نمی‌کنیم.',
    category: 'red_line' as const,
    isActive: true,
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const CANNED = [RED];

  it('inserts a canned answer and sends its id with the message', async () => {
    const fetchMock = mockFetch([[201, {}]]);
    const user = userEvent.setup({ delay: null });
    render(
      createElement(
        ToastProvider,
        null,
        createElement(ReplyForm, {
          threadId: 't-1',
          mode: 'staff',
          status: 'open',
          canned: CANNED,
        }),
      ),
    );
    await user.selectOptions(screen.getByLabelText('درج پاسخ آماده'), RED.id);
    expect((screen.getByLabelText('پاسخ') as HTMLTextAreaElement).value).toBe(RED.body);
    await user.click(screen.getByRole('button', { name: 'ثبت پاسخ' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/questions/t-1/messages');
    expect(bodyOf(fetchMock, 0)).toEqual({ body: RED.body, cannedResponseId: RED.id });
  });

  it('a closed thread cannot be answered by staff', () => {
    render(
      createElement(
        ToastProvider,
        null,
        createElement(ReplyForm, { threadId: 't-1', mode: 'staff', status: 'closed' }),
      ),
    );
    expect(screen.getByText('این سؤال بسته است.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ثبت پاسخ' })).toBeNull();
  });
});
