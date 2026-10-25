import { describe, expect, it } from 'vitest';
import { checkTransition, pathState } from './policy';

const base = { fromSortOrder: 30, sameStage: false, note: null };

describe('checkTransition (data-model.md 2-4)', () => {
  it('advance, skip and exception only move forward; regress only backward', () => {
    expect(checkTransition({ ...base, kind: 'advance', toSortOrder: 40 })).toBe('ok');
    expect(checkTransition({ ...base, kind: 'skip_by_assessment', toSortOrder: 80 })).toBe('ok');
    expect(checkTransition({ ...base, kind: 'advance', toSortOrder: 20 })).toBe('wrong_direction');
    expect(checkTransition({ ...base, kind: 'regress', toSortOrder: 40, note: 'x' })).toBe(
      'wrong_direction',
    );
    expect(checkTransition({ ...base, kind: 'regress', toSortOrder: 10, note: 'دلیل' })).toBe('ok');
  });

  it('the same stage is never a transition', () => {
    expect(checkTransition({ ...base, kind: 'advance', toSortOrder: 30, sameStage: true })).toBe(
      'same_stage',
    );
  });

  it('regress and advance_with_exception need a non-blank note', () => {
    expect(checkTransition({ ...base, kind: 'regress', toSortOrder: 10 })).toBe('note_required');
    expect(
      checkTransition({ ...base, kind: 'advance_with_exception', toSortOrder: 40, note: '  ' }),
    ).toBe('note_required');
    expect(
      checkTransition({ ...base, kind: 'advance_with_exception', toSortOrder: 40, note: 'دلیل' }),
    ).toBe('ok');
  });
});

describe('pathState', () => {
  const current = { id: 'c', sortOrder: 30 };
  it('passed before, current, locked after', () => {
    expect(pathState({ id: 'a', sortOrder: 10 }, current)).toBe('passed');
    expect(pathState({ id: 'c', sortOrder: 30 }, current)).toBe('current');
    expect(pathState({ id: 'd', sortOrder: 40 }, current)).toBe('locked');
  });
});
