// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { BallChip, HealthCell, HealthPill, HealthReasonList } from '@/components/students/health';
import type { HealthSummaryDTO } from '@/modules/students/contracts';
import { attentionRank, healthKind, reasonsLine, reasonText } from './reasons';

afterEach(() => cleanup());

const NOW = new Date('2026-10-21T08:00:00Z');

function summary(over: Partial<HealthSummaryDTO> = {}): HealthSummaryDTO {
  return {
    status: 'red',
    reasons: [
      {
        rule: 'R-OVERDUE',
        level: 'red',
        ball: 'student',
        facts: { overdueCount: 2, maxOverdueDays: 9 },
      },
      { rule: 'R-INACT', level: 'yellow', ball: 'student', facts: { days: 9 } },
    ],
    churnRisk: false,
    snoozedUntil: null,
    ball: 'student',
    statusSince: '2026-10-18T08:00:00Z',
    computedAt: '2026-10-21T07:00:00Z',
    ...over,
  };
}

describe('reasonText (plain Persian from facts)', () => {
  it('builds every rule sentence with Persian digits', () => {
    expect(reasonText({ rule: 'R-INACT', facts: { days: 9 } })).toBe('۹ روز بی‌فعالیت');
    expect(reasonText({ rule: 'R-OVERDUE', facts: { overdueCount: 2, maxOverdueDays: 9 } })).toBe(
      '۲ کار معوق (بیشترین: ۹ روز)',
    );
    expect(reasonText({ rule: 'R-OVERDUE', facts: { overdueCount: 1, maxOverdueDays: 5 } })).toBe(
      'یک کار ۵ روز معوق',
    );
    expect(reasonText({ rule: 'R-STALL', facts: { daysInStage: 21, expectedDays: 10 } })).toBe(
      '۲۱ روز در این مرحله (معمول: ۱۰ روز)',
    );
    expect(reasonText({ rule: 'R-LOOP', facts: { maxRevisions: 4 } })).toBe('۴ دور اصلاح یک کار');
    expect(reasonText({ rule: 'R-NOTASK', facts: { days: 4 } })).toBe('۴ روز بدون هیچ کار باز');
    expect(
      reasonText({ rule: 'R-FLAG', facts: { count: 2, categories: ['financial', 'personal'] } }),
    ).toBe('۲ پرچم دستی: مالی، شخصی');
    expect(reasonText({ rule: 'R-CHECKIN', facts: { weeks: 2 } })).toContain('۲ هفته');
    expect(reasonText({ rule: 'R-MOOD', facts: { mood: 2, weeks: 1 } })).toBe(
      'حال ۲ از ۵ در check-in',
    );
  });

  it('never throws on missing facts', () => {
    expect(reasonText({ rule: 'R-INACT', facts: {} })).toBe('۰ روز بی‌فعالیت');
  });

  it('joins reasons in one line', () => {
    expect(reasonsLine(summary().reasons)).toBe('۲ کار معوق (بیشترین: ۹ روز) · ۹ روز بی‌فعالیت');
  });

  it('badge kind: churn only for red + churnRisk; untracked = nothing', () => {
    expect(healthKind('red', true)).toBe('churn');
    expect(healthKind('red', false)).toBe('red');
    expect(healthKind('yellow', true)).toBe('yellow');
    expect(healthKind('untracked', false)).toBeNull();
  });

  it('default order: red → yellow → waiting submission → green → paused', () => {
    const order = [
      attentionRank('green', false),
      attentionRank('green', true),
      attentionRank('yellow', false),
      attentionRank('red', false),
      attentionRank('paused', false),
    ];
    expect(order).toEqual([3, 2, 1, 0, 4]);
  });
});

describe('HealthPill and reasons (colour + shape + text)', () => {
  it('red badge with text and a decorative shape', () => {
    const { container } = render(createElement(HealthPill, { health: summary() }));
    expect(screen.getByText('گیرکرده')).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('churn risk reads «گیرکرده · خطر ریزش»', () => {
    render(createElement(HealthPill, { health: summary({ churnRisk: true }) }));
    expect(screen.getByText('گیرکرده · خطر ریزش')).toBeTruthy();
  });

  it('snoozed: «هشدار خاموش تا …» but the status stays readable', () => {
    render(
      createElement(HealthPill, { health: summary({ snoozedUntil: '2026-10-27T20:29:59Z' }) }),
    );
    expect(screen.getByText(/هشدار خاموش تا/)).toBeTruthy();
    expect(screen.getByText(/گیرکرده/)).toBeTruthy();
  });

  it('untracked renders nothing', () => {
    const { container } = render(
      createElement(HealthPill, { health: summary({ status: 'untracked', reasons: [] }) }),
    );
    expect(container.textContent).toBe('');
  });

  it('cell shows the plain reason and the small rule codes', () => {
    render(createElement(HealthCell, { health: summary() }));
    expect(screen.getByText(/۲ کار معوق \(بیشترین: ۹ روز\) · ۹ روز بی‌فعالیت/)).toBeTruthy();
    const code = screen.getByText('R-OVERDUE, R-INACT');
    expect(code.getAttribute('dir')).toBe('ltr');
  });

  it('green has no reason line', () => {
    render(
      createElement(HealthCell, { health: summary({ status: 'green', reasons: [], ball: null }) }),
    );
    expect(screen.getByText('روبه‌راه')).toBeTruthy();
    expect(screen.queryByText(/R-/)).toBeNull();
  });

  it('record list: one chip per rule, advice, and «قرمز از …»', () => {
    render(createElement(HealthReasonList, { health: summary(), now: NOW }));
    const list = screen.getByRole('list', { name: 'دلیل وضعیت' });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText(/قرمز از ۳ روز پیش/)).toBeTruthy();
    expect(screen.getByText(/پیشنهاد:/)).toBeTruthy();
  });

  it('ball chip names who acts next', () => {
    render(createElement(BallChip, { ball: 'team' }));
    expect(screen.getByText('توپ: ما')).toBeTruthy();
    expect(screen.getByText('توپ در زمین ما')).toBeTruthy();
  });
});
