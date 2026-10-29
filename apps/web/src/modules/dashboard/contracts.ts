import type { RunMode, RunStatus } from '../programs/schema';

/**
 * GET /dashboard/organization (A) — the organization at a glance (Coach Office sprint 6,
 * architecture-review.md sprint 6): mentees and their health, work waiting on the team, each
 * open course and each mentor's load. Read-only over the other modules' tables.
 */
export type OrgDashboardDTO = {
  generatedAt: string;
  /** Mentees of the organization (not erased); health only for active ones. */
  students: { active: number; paused: number; red: number; yellow: number; green: number };
  work: {
    reviews: number;
    breachedReviews: number;
    unansweredQuestions: number;
    breachedQuestions: number;
    /** Tasks past their deadline with the ball in the mentee's court. */
    overdueTasks: number;
  };
  courses: DashboardCourseDTO[];
  mentors: DashboardMentorDTO[];
};

export type DashboardCourseDTO = {
  id: string;
  title: string;
  isLegacy: boolean;
  mode: RunMode;
  status: RunStatus;
  active: number;
  paused: number;
  /** Average known progress of the seated members (null: none known; the main path has none). */
  averageProgress: number | null;
  /** Health of the active members. */
  red: number;
  yellow: number;
  staff: string[];
};

export type DashboardMentorDTO = {
  id: string;
  displayName: string;
  role: 'admin' | 'mentor';
  students: number;
  primary: number;
  capacity: number | null;
  atCapacity: boolean;
  runs: number;
  overdueReviews: number;
  /** Red active mentees they mentor (primary or secondary). */
  red: number;
};
