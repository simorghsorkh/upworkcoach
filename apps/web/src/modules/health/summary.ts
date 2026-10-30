import type { HealthBall, HealthReasonDTO, HealthRuleCode, HealthStatus } from './contracts';
import { HEALTH_RULES } from './contracts';
import { overallBall } from './rules';
import type { StoredHealthReason } from './schema';

/**
 * Staff-only health summary embedded in the student list, the record header, the kanban
 * and "Today" (api.md section 4). Pure (no I/O); the students and path modules JOIN
 * `student_health` read-only and call this. Never used on a `/me` route (ADR-0004).
 */
export type HealthSummary = {
  status: HealthStatus;
  reasons: HealthReasonDTO[];
  churnRisk: boolean;
  /** "Snoozed until …": only while in the future. */
  snoozedUntil: string | null;
  /** "Whose court is the ball in" for the student as a whole. */
  ball: HealthBall | null;
  statusSince: string;
  computedAt: string;
};

export type HealthColumns = {
  healthStatus: HealthStatus | null;
  healthReasons: StoredHealthReason[] | null;
  healthChurnRisk: boolean | null;
  healthSnoozedUntil: Date | null;
  healthStatusSince: Date | null;
  healthComputedAt: Date | null;
};

const isRule = (rule: string): rule is HealthRuleCode =>
  (HEALTH_RULES as readonly string[]).includes(rule);

export function toHealthReasons(stored: readonly StoredHealthReason[]): HealthReasonDTO[] {
  return stored
    .filter((r): r is StoredHealthReason & { rule: HealthRuleCode } => isRule(r.rule))
    .map((r) => ({ rule: r.rule, level: r.level, ball: r.ball, facts: { ...r.facts } }));
}

/** null while the student has no computed health yet (e.g. right after the migration). */
export function toHealthSummary(row: HealthColumns, now: Date = new Date()): HealthSummary | null {
  if (!row.healthStatus || !row.healthStatusSince || !row.healthComputedAt) return null;
  const reasons = toHealthReasons(row.healthReasons ?? []);
  return {
    status: row.healthStatus,
    reasons,
    churnRisk: row.healthChurnRisk ?? false,
    snoozedUntil:
      row.healthSnoozedUntil && row.healthSnoozedUntil.getTime() > now.getTime()
        ? row.healthSnoozedUntil.toISOString()
        : null,
    ball: overallBall(reasons),
    statusSince: row.healthStatusSince.toISOString(),
    computedAt: row.healthComputedAt.toISOString(),
  };
}
