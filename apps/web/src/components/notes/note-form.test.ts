// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDaysTo, todayDay } from '@/components/format/jalali';
import { SESSION_TEMPLATE } from '@/components/tasks/labels';
import { ToastProvider } from '@/components/ui/toast';
import { NoteForm } from './note-form';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
  usePathname: () => '/students/stu-1',
}));

const STUDENT = { id: 'stu-1', displayName: 'امیر رستمی' };

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

function setup(variant: 'inline' | 'sheet', onCreateTask?: () => void) {
  const user = userEvent.setup({ delay: null });
  const onSaved = vi.fn();
  render(
    createElement(
      ToastProvider,
      null,
      createElement(NoteForm, { student: STUDENT, variant, onSaved, onCreateTask }),
    ),
  );
  return { user, onSaved };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe('NoteForm composer (F5, SEC-F6)', () => {
  it('inline: internal by default; empty text is refused', async () => {
    const fetchMock = mockFetch([[201, {}]]);
    const t = setup('inline');
    expect((screen.getByRole('radio', { name: /داخلی/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText('هنرجو این را می‌بیند')).toBeNull();
    await t.user.click(screen.getByRole('button', { name: 'ثبت یادداشت' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('متن یادداشت را بنویس.')).toBeTruthy();
  });

  it('inline: sends kind and visibility; shared shows «هنرجو این را می‌بیند»', async () => {
    const fetchMock = mockFetch([[201, { id: 'n1' }]]);
    const t = setup('inline');
    await t.user.type(screen.getByLabelText('متن یادداشت'), 'تماس گرفتم؛ از هفته‌ی بعد برمی‌گردد.');
    await t.user.selectOptions(screen.getByLabelText('نوع'), 'call');
    await t.user.click(screen.getByRole('radio', { name: /اشتراکی/ }));
    expect(screen.getByText('هنرجو این را می‌بیند')).toBeTruthy();
    await t.user.click(screen.getByRole('button', { name: 'ثبت یادداشت' }));
    await waitFor(() => expect(t.onSaved).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/students/stu-1/notes');
    expect(bodyOf(fetchMock, 0)).toEqual({
      body: 'تماس گرفتم؛ از هفته‌ی بعد برمی‌گردد.',
      kind: 'call',
      visibility: 'shared',
    });
    expect(await screen.findByText('یادداشت ثبت شد؛ امیر آن را می‌بیند.')).toBeTruthy();
    // The form resets to internal for the next note.
    expect((screen.getByRole('radio', { name: /داخلی/ }) as HTMLInputElement).checked).toBe(true);
    // The kind is remembered for next time (user-flows §5).
    expect(window.localStorage.getItem('uc:note-kind')).toBe('call');
  });

  it('sheet: «جلسه» opens the short template; a reminder follow-up goes to /reminders', async () => {
    const fetchMock = mockFetch([
      [201, { id: 'n1' }],
      [201, { id: 'r1' }],
    ]);
    const t = setup('sheet');
    await t.user.click(screen.getByRole('radio', { name: 'جلسه' }));
    const text = screen.getByLabelText('متن') as HTMLTextAreaElement;
    expect(text.value).toBe(SESSION_TEMPLATE);
    await t.user.click(screen.getByRole('button', { name: 'ثبت یادداشت' }));
    expect(fetchMock).not.toHaveBeenCalled();
    await t.user.type(text, 'نیچ را دو تا کردیم');
    await t.user.click(screen.getByRole('button', { name: 'یادآور ۳ روز' }));
    await t.user.click(screen.getByRole('button', { name: 'ثبت یادداشت' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodyOf(fetchMock, 0)).toMatchObject({ kind: 'session', visibility: 'internal' });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/reminders');
    expect(bodyOf(fetchMock, 1)).toMatchObject({
      studentId: 'stu-1',
      dueDate: addDaysTo(todayDay(), 3),
    });
  });

  it('a failed save keeps the text on this device and offers «تلاش دوباره»', async () => {
    const fetchMock = mockFetch([
      [503, { error: { code: 'UNAVAILABLE', message: '' } }],
      [201, { id: 'n1' }],
    ]);
    const t = setup('inline');
    await t.user.type(screen.getByLabelText('متن یادداشت'), 'یادداشت مهم');
    await t.user.click(screen.getByRole('button', { name: 'ثبت یادداشت' }));
    expect(await screen.findByText(/ذخیره نشد؛ دوباره تلاش کن/)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('uc:note-draft:stu-1') ?? '{}').body).toBe(
      'یادداشت مهم',
    );
    await t.user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    await waitFor(() => expect(t.onSaved).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem('uc:note-draft:stu-1')).toBeNull();
  });

  it('text typed while the previous note is still saving is not wiped', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate;
        return new Response(JSON.stringify({ id: 'n1' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const t = setup('inline');
    const box = screen.getByLabelText('متن یادداشت') as HTMLTextAreaElement;
    await t.user.type(box, 'اولی');
    await t.user.click(screen.getByRole('button', { name: 'ثبت یادداشت' }));
    await t.user.clear(box);
    await t.user.type(box, 'دومی');
    release();
    await waitFor(() => expect(t.onSaved).toHaveBeenCalled());
    expect(box.value).toBe('دومی');
  });

  it('«+ کار از این یادداشت» hands the first line to the task form', async () => {
    mockFetch([[201, { id: 'n1' }]]);
    const onCreateTask = vi.fn();
    const t = setup('sheet', onCreateTask);
    await t.user.type(
      screen.getByLabelText('متن'),
      'بازنویسی تیتر ویترین{enter}با تمرکز روی Shopify',
    );
    await t.user.click(screen.getByRole('button', { name: '+ کار از این یادداشت' }));
    await t.user.click(screen.getByRole('button', { name: 'ثبت یادداشت' }));
    await waitFor(() => expect(onCreateTask).toHaveBeenCalled());
    expect(onCreateTask.mock.calls[0]?.[0]).toBe('بازنویسی تیتر ویترین');
  });
});
