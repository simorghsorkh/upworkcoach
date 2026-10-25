import { describe, expect, it } from 'vitest';
import { createNoteInput, timelineQuery, updateNoteInput } from './contracts';
import { assertSafeEventData, TIMELINE_EVENT_TYPES } from './events';
import { categoryOf, eventTypesFor } from './service';

describe('timeline categories (F5 filter)', () => {
  it('maps every event type to a category', () => {
    expect(categoryOf('stage.changed')).toBe('stage');
    expect(categoryOf('mentor.changed')).toBe('student');
    expect(categoryOf('invite.accepted')).toBe('student');
    expect(categoryOf('submission.created')).toBe('task');
    expect(categoryOf('review.created')).toBe('task');
    expect(categoryOf('health.snoozed')).toBe('health');
    expect(categoryOf('flag.added')).toBe('flag');
  });

  it('a category filter selects exactly its event types', () => {
    expect(eventTypesFor(undefined)).toBeNull();
    expect(eventTypesFor(['stage'])).toEqual(['stage.changed']);
    const task = eventTypesFor(['task']) ?? [];
    expect(task).toContain('task.status_changed');
    expect(task).toContain('review.created');
    expect(task).not.toContain('stage.changed');
    expect(eventTypesFor(['note'])).toEqual([]);
    const everything = eventTypesFor([
      'student',
      'stage',
      'profile',
      'task',
      'question',
      'checkin',
      'milestone',
      'flag',
      'health',
    ]);
    expect(everything?.length).toBe(TIMELINE_EVENT_TYPES.length);
  });

  it('timelineQuery parses a comma list and rejects unknown categories', () => {
    expect(timelineQuery.parse({ types: 'note, stage,note' }).types).toEqual(['note', 'stage']);
    expect(timelineQuery.safeParse({ types: 'note,secret' }).success).toBe(false);
    expect(timelineQuery.safeParse({ types: '' }).success).toBe(false);
  });
});

describe('event data guard', () => {
  it('rejects secrets and links in event data (same rule as audit_log)', () => {
    expect(() => assertSafeEventData({ from: 'a', to: 'b' })).not.toThrow();
    expect(() => assertSafeEventData({ inviteUrl: 'x' })).toThrow();
    expect(() => assertSafeEventData({ token: 'x' })).toThrow();
  });
});

describe('note inputs', () => {
  it('default internal is decided by the service; body is required and normalised', () => {
    const parsed = createNoteInput.parse({ body: '  جلسه با علي  ' });
    expect(parsed.body).toBe('جلسه با علی');
    expect(parsed.visibility).toBeUndefined();
    expect(createNoteInput.safeParse({ body: '   ' }).success).toBe(false);
  });

  it('is strict: no studentId or authorId can be smuggled in (SEC-A7)', () => {
    expect(createNoteInput.safeParse({ body: 'x', authorId: 'y' }).success).toBe(false);
    expect(updateNoteInput.safeParse({ studentId: 'y' }).success).toBe(false);
  });

  it('occurredAt must be an ISO instant', () => {
    expect(createNoteInput.safeParse({ body: 'x', occurredAt: '2026-10-19' }).success).toBe(false);
    expect(
      createNoteInput.parse({ body: 'x', occurredAt: '2026-10-19T08:00:00Z' }).occurredAt,
    ).toBeInstanceOf(Date);
  });
});
