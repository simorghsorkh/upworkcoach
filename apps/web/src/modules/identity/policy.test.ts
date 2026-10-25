import { describe, expect, it } from 'vitest';
import type { Actor } from '@/server/auth/current-user';
import {
  adminOnly,
  inviteLinkDecision,
  resetLinkDecision,
  staffOnly,
  type TargetUser,
} from './policy';

const admin: Actor = { userId: 'a', role: 'admin' };
const mentor: Actor = { userId: 'm', role: 'mentor' };
const student: Actor = { userId: 's', role: 'student' };

const user = (over: Partial<TargetUser>): TargetUser => ({
  role: 'student',
  status: 'invited',
  erasedAt: null,
  ...over,
});

describe('role gates', () => {
  it('adminOnly and staffOnly', () => {
    expect([admin, mentor, student].map(adminOnly)).toEqual(['ok', 'forbidden', 'forbidden']);
    expect([admin, mentor, student].map(staffOnly)).toEqual(['ok', 'ok', 'forbidden']);
  });
});

describe('inviteLinkDecision (ADR-0004, C3, T-ESC)', () => {
  it('admin: any invited user; otherwise 409; missing 404', () => {
    expect(inviteLinkDecision(admin, user({ role: 'admin' }), false)).toBe('ok');
    expect(inviteLinkDecision(admin, user({ role: 'mentor' }), false)).toBe('ok');
    expect(inviteLinkDecision(admin, user({ status: 'active' }), false)).toBe('conflict');
    expect(inviteLinkDecision(admin, user({ erasedAt: new Date() }), false)).toBe('conflict');
    expect(inviteLinkDecision(admin, null, false)).toBe('not_found');
  });

  it('mentor: never for an invited admin or mentor — 404, even if "in scope"', () => {
    expect(inviteLinkDecision(mentor, user({ role: 'admin' }), true)).toBe('not_found');
    expect(inviteLinkDecision(mentor, user({ role: 'mentor' }), true)).toBe('not_found');
  });

  it('mentor: invited student in scope only', () => {
    expect(inviteLinkDecision(mentor, user({}), true)).toBe('ok');
    expect(inviteLinkDecision(mentor, user({}), false)).toBe('not_found');
    expect(inviteLinkDecision(mentor, user({ status: 'active' }), true)).toBe('not_found');
    expect(inviteLinkDecision(mentor, user({ status: 'disabled' }), true)).toBe('not_found');
    expect(inviteLinkDecision(mentor, null, true)).toBe('not_found');
  });

  it('student: 403', () => {
    expect(inviteLinkDecision(student, user({}), true)).toBe('forbidden');
  });
});

describe('resetLinkDecision', () => {
  it('admin only, active users only', () => {
    expect(resetLinkDecision(admin, user({ status: 'active' }))).toBe('ok');
    expect(resetLinkDecision(admin, user({ status: 'invited' }))).toBe('conflict');
    expect(resetLinkDecision(admin, user({ status: 'disabled' }))).toBe('conflict');
    expect(resetLinkDecision(admin, user({ status: 'disabled', erasedAt: new Date() }))).toBe(
      'conflict',
    );
    expect(resetLinkDecision(admin, null)).toBe('not_found');
    expect(resetLinkDecision(mentor, user({ status: 'active' }))).toBe('forbidden');
    expect(resetLinkDecision(student, user({ status: 'active' }))).toBe('forbidden');
  });
});
