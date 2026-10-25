// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDaysTo, formatJalaliInput, todayDay } from '@/components/format/jalali';
import type { TaskTemplateDTO } from '@/modules/catalog/contracts';
import { TaskForm } from './task-form';

const STAGE = { id: 'st-5', label: '۵ — پروپوزال و ارسال' };
const TEMPLATE: TaskTemplateDTO = {
  id: 'tpl-1',
  stageId: STAGE.id,
  title: 'پروپوزال برای بررسی',
  description: 'یک جاب واقعی انتخاب کن.\nوقتی قبول است که: دو خط اول درباره‌ی کارفرماست.',
  kind: 'path_assignment',
  submissionType: 'proposal_review',
  defaultDueDays: 7,
  requiredForGate: true,
  suggestOnStageEntry: true,
  sortOrder: 10,
  isActive: true,
  updatedAt: '2026-10-01T08:00:00.000Z',
};

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

const sent = (m: ReturnType<typeof mockFetch>, i = 0) =>
  JSON.parse(String(m.mock.calls[i]?.[1]?.body ?? '{}')) as Record<string, unknown>;

function setup(students = [{ id: 'stu-1', displayName: 'امیر رستمی' }], lock = true) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(
    createElement(TaskForm, {
      students,
      lockStudent: lock,
      templates: [TEMPLATE],
      stages: [STAGE],
      reviewers: [],
      defaultStageId: STAGE.id,
      onDone,
      onCancel,
    }),
  );
  return { user, onDone, onCancel };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => cleanup());

describe('TaskForm (M5a, F4)', () => {
  it('validates title and student before any request', async () => {
    const fetchMock = mockFetch(201, {});
    const t = setup([], false);
    await t.user.click(screen.getByRole('button', { name: 'ثبت کار' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('دست‌کم یک هنرجو انتخاب کن.')).toBeTruthy();
    expect(screen.getByText('عنوان کار را وارد کن.')).toBeTruthy();
  });

  it('defaults the deadline to 3 days, shown as a Jalali date, and sends the Gregorian day', async () => {
    const fetchMock = mockFetch(201, { id: 'task-1', title: 'بازنویسی تیتر' });
    const t = setup();
    const due = screen.getByLabelText('مهلت') as HTMLInputElement;
    expect(due.value).toBe(formatJalaliInput(addDaysTo(todayDay(), 3)));
    await t.user.type(screen.getByLabelText('عنوان'), 'بازنویسی تیتر');
    await t.user.click(screen.getByRole('button', { name: '۱ هفته' }));
    await t.user.click(screen.getByRole('button', { name: 'ثبت کار' }));
    await waitFor(() => expect(t.onDone).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/students/stu-1/tasks');
    expect(sent(fetchMock)).toMatchObject({
      title: 'بازنویسی تیتر',
      submissionType: 'text',
      dueDate: addDaysTo(todayDay(), 7),
      stageId: STAGE.id,
      requiredForGate: false,
      priority: 'normal',
    });
  });

  it('a typed Jalali date (Persian digits) becomes the Gregorian day; past dates are refused', async () => {
    const fetchMock = mockFetch(201, { id: 'task-1', title: 'x' });
    const t = setup();
    await t.user.type(screen.getByLabelText('عنوان'), 'کار');
    const due = screen.getByLabelText('مهلت');
    await t.user.clear(due);
    await t.user.type(due, '۱۴۰۰/۰۱/۰۱');
    await t.user.tab();
    expect(screen.getByRole('alert').textContent).toMatch(/نباید پیش از/);
    await t.user.click(screen.getByRole('button', { name: 'ثبت کار' }));
    expect(fetchMock).not.toHaveBeenCalled();
    await t.user.clear(due);
    await t.user.type(due, formatJalaliInput(addDaysTo(todayDay(), 10)));
    await t.user.click(screen.getByRole('button', { name: 'ثبت کار' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock).dueDate).toBe(addDaysTo(todayDay(), 10));
  });

  it('a template fills type, title, description, gate and its default days', async () => {
    const fetchMock = mockFetch(201, { id: 'task-1', title: TEMPLATE.title });
    const t = setup();
    await t.user.selectOptions(screen.getByLabelText(/از قالب/), TEMPLATE.id);
    expect((screen.getByLabelText('عنوان') as HTMLInputElement).value).toBe(TEMPLATE.title);
    expect(
      (screen.getByRole('radio', { name: 'پروپوزال برای بررسی' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByText(/متن آگهی و متن پروپوزال را جدا می‌فرستد/)).toBeTruthy();
    expect(screen.getByText('هنرجو این را می‌بیند')).toBeTruthy();
    await t.user.click(screen.getByRole('button', { name: 'ثبت کار' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock)).toMatchObject({
      templateId: TEMPLATE.id,
      submissionType: 'proposal_review',
      requiredForGate: true,
      dueDate: addDaysTo(todayDay(), 7),
    });
  });

  it('several students → one bulk request; a 422 lands on its field', async () => {
    const fetchMock = mockFetch(201, { batchId: 'b', created: 2, taskIds: ['a', 'b'] });
    const t = setup(
      [
        { id: 'stu-1', displayName: 'امیر رستمی' },
        { id: 'stu-2', displayName: 'سارا محمدی' },
      ],
      false,
    );
    await t.user.type(screen.getByLabelText('عنوان'), 'ارسال ۱۰ پروپوزال');
    await t.user.click(screen.getByRole('button', { name: 'ثبت ۲ کار' }));
    await waitFor(() => expect(t.onDone).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/tasks/bulk');
    expect(sent(fetchMock).studentIds).toEqual(['stu-1', 'stu-2']);
    expect(t.onDone.mock.calls[0]?.[0]).toEqual({ mode: 'bulk', created: 2, taskIds: ['a', 'b'] });

    cleanup();
    mockFetch(422, {
      error: { code: 'VALIDATION_FAILED', message: 'x', fields: { dueDate: 'مهلت گذشته است.' } },
    });
    const t2 = setup();
    await t2.user.type(screen.getByLabelText('عنوان'), 'کار');
    await t2.user.click(screen.getByRole('button', { name: 'ثبت کار' }));
    expect(await screen.findByText('مهلت گذشته است.')).toBeTruthy();
    expect(t2.onDone).not.toHaveBeenCalled();
  });
});
