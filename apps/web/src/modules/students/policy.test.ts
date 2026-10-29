import { describe, expect, it } from 'vitest';
import type { Actor } from '@/server/auth/current-user';
import {
  buildSearchText,
  changeMentorDecision,
  completeness,
  createStudentDecision,
  daysSince,
  likePattern,
  mentorForNewStudent,
  overExpected,
  staffOnly,
  studentOnly,
} from './policy';

const ORG = '00000000-0000-7000-8000-0000000000f1';
const admin: Actor = {
  userId: 'a',
  role: 'admin',
  organizationId: ORG,
  organizationRole: 'admin',
};
const mentor: Actor = {
  userId: 'm',
  role: 'mentor',
  organizationId: ORG,
  organizationRole: 'mentor',
};
const student: Actor = {
  userId: 's',
  role: 'student',
  organizationId: ORG,
  organizationRole: 'mentee',
};
const canInvite = { mentorScope: 'assigned' as const, mentorsCanInviteStudents: true };
const cannotInvite = { mentorScope: 'assigned' as const, mentorsCanInviteStudents: false };

describe('students policy (ADR-0004 section 2)', () => {
  it('staff-only and student-only routes', () => {
    expect([admin, mentor, student].map(staffOnly)).toEqual(['ok', 'ok', 'forbidden']);
    expect([admin, mentor, student].map(studentOnly)).toEqual(['forbidden', 'forbidden', 'ok']);
  });

  it('creating students: admin always, mentor only with mentorsCanInviteStudents', () => {
    expect(createStudentDecision(admin, cannotInvite)).toBe('ok');
    expect(createStudentDecision(mentor, canInvite)).toBe('ok');
    expect(createStudentDecision(mentor, cannotInvite)).toBe('forbidden');
    expect(createStudentDecision(student, canInvite)).toBe('forbidden');
  });

  it('a mentor always gets the new student; an admin chooses (default unassigned)', () => {
    expect(mentorForNewStudent(mentor, 'someone-else')).toBe('m');
    expect(mentorForNewStudent(mentor, undefined)).toBe('m');
    expect(mentorForNewStudent(admin, 'x')).toBe('x');
    expect(mentorForNewStudent(admin, undefined)).toBeNull();
  });

  it('only admins change the primary mentor', () => {
    expect([admin, mentor, student].map(changeMentorDecision)).toEqual([
      'ok',
      'forbidden',
      'forbidden',
    ]);
  });
});

describe('days in stage and the F3 warning', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  it('counts whole days, never negative', () => {
    expect(daysSince(new Date('2026-10-20T11:00:00Z'), now)).toBe(0);
    expect(daysSince(new Date('2026-10-18T12:00:00Z'), now)).toBe(2);
    expect(daysSince(new Date('2026-10-21T12:00:00Z'), now)).toBe(0);
  });

  it('warn above expected days, over above twice; none for open-ended or no expectation', () => {
    const stage = { expectedDays: 10, isOpenEnded: false };
    expect(overExpected(10, stage)).toBe('none');
    expect(overExpected(11, stage)).toBe('warn');
    expect(overExpected(20, stage)).toBe('warn');
    expect(overExpected(21, stage)).toBe('over');
    expect(overExpected(999, { expectedDays: null, isOpenEnded: false })).toBe('none');
    expect(overExpected(999, { expectedDays: 10, isOpenEnded: true })).toBe('none');
  });
});

describe('search text (ADR-0008)', () => {
  it('normalises the name and holds both phone forms, the handle and tags', () => {
    const text = buildSearchText({
      displayName: 'علي  كريمي',
      phone: '+989121234567',
      messengerHandle: '@Sara_Dev',
      tags: ['کوهورت ۳'],
    });
    expect(text).toContain('علی کریمی');
    expect(text).toContain('989121234567');
    expect(text).toContain('09121234567');
    expect(text).toContain('@sara_dev');
    expect(text).toContain('کوهورت 3');
  });

  it('an erased phone is not indexed', () => {
    expect(
      buildSearchText({ displayName: 'x', phone: 'erased:1', messengerHandle: null, tags: [] }),
    ).toBe('x');
  });

  it('LIKE wildcards in the query are literal', () => {
    expect(likePattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  });
});

describe('record completeness', () => {
  it('percent and missing fields', () => {
    const none = completeness({
      mentor: false,
      track: false,
      primaryPlatform: false,
      level: false,
      primarySkill: false,
      nicheStatement: false,
      messengerHandle: false,
      englishWriting: false,
      hoursPerWeek: false,
      incomeGoalUsd: false,
      goal90d: false,
      primaryProfile: false,
    });
    expect(none.percent).toBe(0);
    expect(none.missing).toHaveLength(12);
    const half = completeness({
      mentor: true,
      track: true,
      primaryPlatform: true,
      level: true,
      primarySkill: true,
      nicheStatement: true,
      messengerHandle: false,
      englishWriting: false,
      hoursPerWeek: false,
      incomeGoalUsd: false,
      goal90d: false,
      primaryProfile: false,
    });
    expect(half.percent).toBe(50);
  });
});
