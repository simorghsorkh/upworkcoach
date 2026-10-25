import { describe, expect, it } from 'vitest';
import { createStageInput } from '@/modules/catalog/contracts';
import {
  createProfileInput,
  createStudentInput,
  listStudentsQuery,
  updateOwnStudentInput,
  updateStudentInput,
} from '@/modules/students/contracts';
import {
  dayInput,
  decodeCursor,
  encodeCursor,
  httpsUrl,
  intInput,
  moneyInput,
  shortText,
  tagsInput,
} from './schemas';

describe('httpsUrl (SEC-X2)', () => {
  it('accepts https URLs only, without credentials', () => {
    expect(httpsUrl.parse(' https://www.upwork.com/freelancers/~01 ')).toBe(
      'https://www.upwork.com/freelancers/~01',
    );
    for (const bad of [
      'http://x.com',
      'javascript:alert(1)',
      'data:text/html,x',
      'https://u:p@x.com',
      'https://u@x.com',
      'www.x.com',
      `https://x.com/${'a'.repeat(2050)}`,
    ]) {
      expect(httpsUrl.safeParse(bad).success).toBe(false);
    }
  });
});

describe('text and number inputs (ADR-0008)', () => {
  it('shortText normalises and turns empty into null', () => {
    expect(shortText(20).parse(' علي ‮ كريمي ')).toBe('علی کریمی');
    expect(shortText(20).parse('   ')).toBeNull();
    expect(shortText(3).safeParse('abcd').success).toBe(false);
  });

  it('intInput and moneyInput accept Persian digits', () => {
    expect(intInput(0, 168).parse('۱۲')).toBe(12);
    expect(intInput(0, 168).safeParse('169').success).toBe(false);
    expect(intInput(0, 168).safeParse(1.5).success).toBe(false);
    expect(moneyInput.parse('۲۵.۵')).toBe('25.5');
    expect(moneyInput.safeParse('-1').success).toBe(false);
    expect(moneyInput.safeParse('1.234').success).toBe(false);
  });

  it('tags are normalised, de-duplicated and bounded', () => {
    expect(tagsInput.parse([' الف ', 'الف', '', 'ب'])).toEqual(['الف', 'ب']);
    expect(tagsInput.safeParse(['x'.repeat(41)]).success).toBe(false);
    expect(tagsInput.safeParse(Array.from({ length: 21 }, (_, i) => `t${i}`)).success).toBe(false);
  });

  it('dayInput is a real calendar day', () => {
    expect(dayInput.safeParse('2026-02-30').success).toBe(false);
    expect(dayInput.safeParse('2026-10-20').success).toBe(true);
  });

  it('cursor round trip; malformed → -1', () => {
    expect(decodeCursor(encodeCursor(50))).toBe(50);
    expect(decodeCursor(undefined)).toBe(0);
    expect(decodeCursor('garbage')).toBe(-1);
    expect(decodeCursor(Buffer.from('{"o":-3}').toString('base64url'))).toBe(-1);
  });
});

describe('contracts are strict (SEC-A7)', () => {
  it('createStudentInput: only name and phone required; unknown keys rejected', () => {
    expect(createStudentInput.parse({ displayName: 'سارا', phone: '۰۹۱۲۱۲۳۴۵۶۷' })).toMatchObject({
      phone: '+989121234567',
    });
    expect(
      createStudentInput.safeParse({ displayName: 'x', phone: '09121234567', role: 'admin' })
        .success,
    ).toBe(false);
  });

  it('PATCH /students has no mentor, stage or lifecycle; PATCH /me/student only the whitelist', () => {
    for (const key of ['primaryMentorId', 'currentStageId', 'lifecycleStatus']) {
      expect(updateStudentInput.safeParse({ [key]: 'x' }).success).toBe(false);
    }
    for (const key of ['tags', 'level', 'cohort', 'nicheStatement', 'joinedAt', 'trackId']) {
      expect(updateOwnStudentInput.safeParse({ [key]: null }).success).toBe(false);
    }
    expect(updateOwnStudentInput.parse({ skillLevel: '۴', primaryPlatformId: null })).toEqual({
      skillLevel: 4,
      primaryPlatformId: null,
    });
    expect(updateOwnStudentInput.safeParse({ skillLevel: 6 }).success).toBe(false);
  });

  it('profiles have no password field (tech-stack.md rule 8)', () => {
    const base = { platformId: '01920000-0000-7000-8000-000000000401', kind: 'profile' };
    expect(createProfileInput.safeParse(base).success).toBe(true);
    for (const key of ['password', 'loginEmail', 'cookie']) {
      expect(createProfileInput.safeParse({ ...base, [key]: 'x' }).success).toBe(false);
    }
  });

  it('list query: lifecycle list or all; bad values rejected', () => {
    expect(listStudentsQuery.parse({ lifecycle: 'active,paused' }).lifecycle).toEqual([
      'active',
      'paused',
    ]);
    expect(listStudentsQuery.parse({ lifecycle: 'all' }).lifecycle).toHaveLength(4);
    expect(listStudentsQuery.safeParse({ lifecycle: 'deleted' }).success).toBe(false);
    // Sprint 4: the health filter exists (one status or a list); unknown values → 422.
    expect(listStudentsQuery.parse({ health: 'yellow,red' }).health).toEqual(['yellow', 'red']);
    expect(listStudentsQuery.safeParse({ health: 'purple' }).success).toBe(false);
  });

  it('stage content links must be https', () => {
    expect(
      createStageInput.safeParse({
        displayCode: '۹',
        name: 'x',
        contentLinks: [{ title: 't', url: 'http://x.com' }],
      }).success,
    ).toBe(false);
  });
});
