import { describe, expect, it } from 'vitest';
import { tehranDayEnd } from '@/lib/tehran-day';
import {
  canEditReview,
  compareForStudent,
  isOverdue,
  nextStatus,
  overdueDays,
  type TaskAction,
  type TaskStatus,
  transitionError,
  validateSubmission,
} from './policy';

const ALL: TaskStatus[] = [
  'open',
  'in_progress',
  'submitted',
  'changes_requested',
  'accepted',
  'cancelled',
];

describe('task state machine (data-model.md 3-1, PRD F4)', () => {
  const expected: Record<TaskAction, Partial<Record<TaskStatus, TaskStatus>>> = {
    start: { open: 'in_progress' },
    submit: { open: 'submitted', in_progress: 'submitted', changes_requested: 'submitted' },
    review_accept: { submitted: 'accepted' },
    review_changes: { submitted: 'changes_requested' },
    cancel: {
      open: 'cancelled',
      in_progress: 'cancelled',
      submitted: 'cancelled',
      changes_requested: 'cancelled',
    },
  };

  for (const action of Object.keys(expected) as TaskAction[]) {
    for (const from of ALL) {
      const to = expected[action][from] ?? null;
      it(`${action} from ${from} → ${to ?? 'refused'}`, () => {
        expect(nextStatus(from, action, 'text')).toBe(to);
      });
    }
  }

  it('a checkbox task is accepted when the student ticks it', () => {
    expect(nextStatus('open', 'submit', 'checkbox')).toBe('accepted');
    expect(nextStatus('in_progress', 'submit', 'checkbox')).toBe('accepted');
    expect(nextStatus('accepted', 'submit', 'checkbox')).toBeNull();
  });

  it('final statuses refuse everything, with a Persian reason', () => {
    for (const action of Object.keys(expected) as TaskAction[]) {
      expect(nextStatus('accepted', action, 'text')).toBeNull();
      expect(nextStatus('cancelled', action, 'text')).toBeNull();
    }
    expect(transitionError('accepted', 'submit')).toBe('این کار قبلاً تأیید شده است.');
    expect(transitionError('cancelled', 'start')).toBe('این کار لغو شده است.');
    expect(transitionError('submitted', 'submit')).toContain('منتظر بازبینی');
    expect(transitionError('open', 'review_accept')).toContain('منتظر بازبینی نیست');
  });
});

describe('overdue label (never stored)', () => {
  const due = tehranDayEnd('2026-10-20');
  const later = new Date('2026-10-23T08:00:00Z');

  it('only student-actionable statuses past the deadline are overdue', () => {
    for (const status of ALL) {
      const want = ['open', 'in_progress', 'changes_requested'].includes(status);
      expect(isOverdue(status, due, later)).toBe(want);
    }
    expect(isOverdue('open', due, new Date('2026-10-20T10:00:00Z'))).toBe(false);
  });

  it('counts Tehran calendar days late (at least 1)', () => {
    expect(overdueDays('open', due, later)).toBe(3);
    expect(overdueDays('open', due, new Date('2026-10-20T20:45:00Z'))).toBe(1);
    expect(overdueDays('submitted', due, later)).toBe(0);
  });

  it('student order: overdue first, then by deadline, finished last', () => {
    const now = new Date('2026-10-22T08:00:00Z');
    const tasks = [
      { id: 'done', status: 'accepted' as TaskStatus, dueAt: new Date('2026-10-01T00:00:00Z') },
      { id: 'soon', status: 'open' as TaskStatus, dueAt: new Date('2026-10-23T00:00:00Z') },
      { id: 'late2', status: 'open' as TaskStatus, dueAt: new Date('2026-10-21T00:00:00Z') },
      {
        id: 'late1',
        status: 'changes_requested' as TaskStatus,
        dueAt: new Date('2026-10-19T00:00:00Z'),
      },
      { id: 'waiting', status: 'submitted' as TaskStatus, dueAt: new Date('2026-10-20T00:00:00Z') },
    ];
    expect(tasks.sort((a, b) => compareForStudent(a, b, now)).map((t) => t.id)).toEqual([
      'late1',
      'late2',
      'waiting',
      'soon',
      'done',
    ]);
  });
});

describe('validateSubmission (api.md section 6)', () => {
  it('proposal_review needs platform, job post and proposal', () => {
    expect(Object.keys(validateSubmission('proposal_review', {}))).toEqual([
      'platformId',
      'jobPostText',
      'proposalText',
    ]);
    expect(
      validateSubmission('proposal_review', {
        platformId: 'p',
        jobPostText: 'job',
        proposalText: 'proposal',
      }),
    ).toEqual({});
  });

  it('text needs a body; link needs a link; file needs an attachment; checkbox nothing', () => {
    expect(validateSubmission('text', {})).toHaveProperty('bodyText');
    expect(validateSubmission('link', { bodyText: 'x' })).toHaveProperty('links');
    expect(validateSubmission('file', {})).toHaveProperty('attachmentIds');
    expect(validateSubmission('file', { attachmentIds: ['a'] })).toEqual({});
    expect(validateSubmission('checkbox', {})).toEqual({});
    expect(validateSubmission('profile_review', {})).toHaveProperty('profileText');
  });

  it('fields of another type are refused', () => {
    expect(validateSubmission('text', { bodyText: 'x', jobPostText: 'job' })).toEqual({
      jobPostText: 'برای این نوع کار نیست.',
    });
    expect(validateSubmission('text', { bodyText: 'x', profileText: 'p' })).toHaveProperty(
      'profileText',
    );
  });
});

describe('review edit window', () => {
  it('24 hours from creation', () => {
    const created = new Date('2026-10-20T08:00:00Z');
    expect(canEditReview(created, new Date('2026-10-21T07:59:00Z'))).toBe(true);
    expect(canEditReview(created, new Date('2026-10-21T08:01:00Z'))).toBe(false);
  });
});
