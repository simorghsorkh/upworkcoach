import type { Role } from '../auth/current-user';

/**
 * Every API endpoint and who may call it (ADR-0004 section 4, security.md T-MATRIX).
 * The integration test calls each endpoint as every role and checks the status classes
 * below; a `route.ts` that is not listed here fails the test. No path has a `:token`
 * segment (C1, T-TOKEN).
 *
 * access:
 *   'public'          — no session needed
 *   'any'             — any signed-in user
 *   Role[]            — only these roles; other signed-in roles get 403
 *
 * `scoped`: roles in the list may still get 404/409 depending on the target (e.g. a mentor
 * asking for an invite link of an admin) — the matrix test then only checks "not 401/403".
 */
export type RouteAccess = 'public' | 'any' | readonly Role[];

export type RouteEntry = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Next.js-style path below /api/v1 (`[id]` for path params). */
  path: string;
  access: RouteAccess;
  scoped?: boolean;
};

export const ROUTES: readonly RouteEntry[] = [
  // api.md section 2 — auth and session
  { method: 'POST', path: '/auth/login', access: 'public' },
  { method: 'POST', path: '/auth/logout', access: 'any' },
  { method: 'GET', path: '/auth/me', access: 'any' },
  { method: 'POST', path: '/auth/change-password', access: 'any', scoped: true },
  { method: 'GET', path: '/auth/sessions', access: 'any' },
  { method: 'DELETE', path: '/auth/sessions/[id]', access: 'any', scoped: true },
  { method: 'POST', path: '/auth/tokens/lookup', access: 'public' },
  { method: 'POST', path: '/auth/tokens/accept', access: 'public' },
  // followup F-06 (SEC-S7)
  { method: 'POST', path: '/auth/reauth', access: 'any', scoped: true },
  // ADR-0011 — the organizations of the signed-in user and switching between them
  { method: 'GET', path: '/auth/organizations', access: 'any' },
  // ADR-0013 — interface language of the account
  { method: 'PATCH', path: '/auth/preferences', access: 'any', scoped: true },
  { method: 'POST', path: '/auth/organization', access: 'any', scoped: true },
  // api.md section 3 — users and invitations
  { method: 'GET', path: '/users', access: ['admin'] },
  { method: 'GET', path: '/mentors', access: ['admin', 'mentor'] },
  { method: 'POST', path: '/invitations', access: ['admin'] },
  { method: 'POST', path: '/users/[id]/invite-link', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/users/[id]/reset-link', access: ['admin'], scoped: true },
  // followup F-02
  { method: 'PATCH', path: '/users/[id]', access: ['admin'], scoped: true },
  { method: 'PATCH', path: '/users/[id]/role', access: ['admin'], scoped: true },
  // api.md section 4 — students and record
  { method: 'GET', path: '/students', access: ['admin', 'mentor'] },
  { method: 'POST', path: '/students', access: ['admin', 'mentor'] },
  { method: 'GET', path: '/students/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'PATCH', path: '/students/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/students/[id]/summary', access: ['admin', 'mentor'], scoped: true },
  { method: 'PUT', path: '/students/[id]/mentor', access: ['admin'], scoped: true },
  { method: 'PUT', path: '/students/[id]/lifecycle', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/me/student', access: ['student'] },
  { method: 'PATCH', path: '/me/student', access: ['student'] },
  // api.md section 4 — platform profiles
  { method: 'GET', path: '/students/[id]/profiles', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/students/[id]/profiles', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/me/profiles', access: ['student'] },
  { method: 'POST', path: '/me/profiles', access: ['student'] },
  { method: 'PATCH', path: '/profiles/[id]', access: 'any', scoped: true },
  { method: 'DELETE', path: '/profiles/[id]', access: 'any', scoped: true },
  { method: 'POST', path: '/profiles/[id]/approve', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/profiles/[id]/snapshots', access: 'any', scoped: true },
  { method: 'POST', path: '/profiles/[id]/snapshots', access: 'any', scoped: true },
  // api.md section 5 — path, stages and kanban
  { method: 'GET', path: '/stages', access: 'any' },
  { method: 'POST', path: '/stages', access: ['admin'] },
  { method: 'PATCH', path: '/stages/[id]', access: ['admin'], scoped: true },
  { method: 'PUT', path: '/stages/order', access: ['admin'], scoped: true },
  { method: 'POST', path: '/stages/[id]/deactivate', access: ['admin'], scoped: true },
  { method: 'PUT', path: '/students/[id]/stage', access: ['admin', 'mentor'], scoped: true },
  {
    method: 'GET',
    path: '/students/[id]/stage-history',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  { method: 'GET', path: '/board', access: ['admin', 'mentor'] },
  { method: 'GET', path: '/me/path', access: ['student'] },
  // api.md section 13 — catalog
  { method: 'GET', path: '/platforms', access: 'any' },
  { method: 'POST', path: '/platforms', access: ['admin'] },
  { method: 'PATCH', path: '/platforms/[id]', access: ['admin'], scoped: true },
  { method: 'GET', path: '/tracks', access: 'any' },
  // api.md section 6 — tasks, submissions, reviews (sprint 3)
  { method: 'GET', path: '/students/[id]/tasks', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/students/[id]/tasks', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/me/tasks', access: ['student'] },
  { method: 'GET', path: '/tasks', access: ['admin', 'mentor'] },
  { method: 'POST', path: '/tasks/bulk', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/tasks/[id]', access: 'any', scoped: true },
  { method: 'PATCH', path: '/tasks/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/tasks/[id]/extend', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/tasks/[id]/cancel', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/tasks/[id]/start', access: ['student'], scoped: true },
  { method: 'POST', path: '/tasks/[id]/submissions', access: ['student'], scoped: true },
  { method: 'POST', path: '/submissions/[id]/review', access: ['admin', 'mentor'], scoped: true },
  { method: 'PATCH', path: '/reviews/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/review-queue', access: ['admin', 'mentor'] },
  { method: 'GET', path: '/task-templates', access: ['admin', 'mentor'] },
  { method: 'POST', path: '/task-templates', access: ['admin'] },
  { method: 'PATCH', path: '/task-templates/[id]', access: ['admin'], scoped: true },
  // api.md section 7 — notes and timeline (sprint 3)
  { method: 'GET', path: '/students/[id]/notes', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/students/[id]/notes', access: ['admin', 'mentor'], scoped: true },
  { method: 'PATCH', path: '/notes/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'DELETE', path: '/notes/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/me/shared-notes', access: ['student'] },
  { method: 'GET', path: '/students/[id]/timeline', access: ['admin', 'mentor'], scoped: true },
  // api.md section 8 — reminders and today (sprint 3)
  { method: 'GET', path: '/reminders', access: ['admin', 'mentor'] },
  { method: 'POST', path: '/reminders', access: ['admin', 'mentor'], scoped: true },
  { method: 'PATCH', path: '/reminders/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'DELETE', path: '/reminders/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/reminders/[id]/done', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/reminders/[id]/snooze', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/today', access: ['admin', 'mentor'] },
  // api.md section 14 — attachments (sprint 3)
  { method: 'POST', path: '/attachments', access: 'any', scoped: true },
  { method: 'GET', path: '/attachments/[id]', access: 'any', scoped: true },
  // api.md section 13 — CSV import and exports (F11 Should, sprint 3)
  { method: 'POST', path: '/imports/students', access: ['admin'], scoped: true },
  { method: 'GET', path: '/exports/students.csv', access: ['admin'] },
  { method: 'GET', path: '/exports/tasks.csv', access: ['admin'] },
  // ---- sprint 4 ----
  // api.md section 4 — student list helpers
  { method: 'GET', path: '/students/tags', access: ['admin', 'mentor'] },
  // api.md section 9 — health and flags (never a student)
  { method: 'GET', path: '/students/[id]/health', access: ['admin', 'mentor'], scoped: true },
  {
    method: 'PUT',
    path: '/students/[id]/health/snooze',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'DELETE',
    path: '/students/[id]/health/snooze',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  { method: 'GET', path: '/students/[id]/flags', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/students/[id]/flags', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/flags/[id]/clear', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/stuck', access: ['admin', 'mentor'] },
  { method: 'POST', path: '/admin/health/recompute', access: ['admin'] },
  // api.md section 10 — questions
  { method: 'GET', path: '/questions', access: ['admin', 'mentor'] },
  { method: 'GET', path: '/me/questions', access: ['student'] },
  { method: 'POST', path: '/me/questions', access: ['student'] },
  { method: 'GET', path: '/questions/[id]', access: 'any', scoped: true },
  { method: 'POST', path: '/questions/[id]/messages', access: 'any', scoped: true },
  { method: 'POST', path: '/questions/[id]/close', access: 'any', scoped: true },
  { method: 'PUT', path: '/questions/[id]/assignee', access: ['admin'], scoped: true },
  { method: 'GET', path: '/canned-responses', access: ['admin', 'mentor'] },
  { method: 'POST', path: '/canned-responses', access: ['admin'] },
  { method: 'PATCH', path: '/canned-responses/[id]', access: ['admin'], scoped: true },
  // api.md section 11 — weekly check-in
  { method: 'GET', path: '/me/checkins/current', access: ['student'] },
  { method: 'POST', path: '/me/checkins', access: ['student'], scoped: true },
  { method: 'GET', path: '/students/[id]/checkins', access: ['admin', 'mentor'], scoped: true },
  // api.md section 12 — milestones and North Star
  { method: 'GET', path: '/milestone-types', access: 'any' },
  { method: 'POST', path: '/milestone-types', access: ['admin'] },
  { method: 'PATCH', path: '/milestone-types/[id]', access: ['admin'], scoped: true },
  { method: 'GET', path: '/students/[id]/milestones', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/students/[id]/milestones', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/me/milestones', access: ['student'] },
  { method: 'POST', path: '/me/milestones', access: ['student'], scoped: true },
  { method: 'POST', path: '/milestones/[id]/approve', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/milestones/[id]/reject', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/dashboard/north-star', access: ['admin'] },
  { method: 'GET', path: '/dashboard/organization', access: ['admin'] },
  // Coach Office sprint 6b — in-app notifications (own rows only)
  { method: 'GET', path: '/notifications', access: ['admin', 'mentor', 'student'] },
  { method: 'POST', path: '/notifications/read', access: ['admin', 'mentor', 'student'] },
  { method: 'GET', path: '/exports/milestones.csv', access: ['admin'] },
  // api.md section 13 — settings
  { method: 'GET', path: '/settings', access: ['admin'] },
  { method: 'PUT', path: '/settings', access: ['admin'] },
  { method: 'PUT', path: '/settings/[key]', access: ['admin'], scoped: true },
  { method: 'GET', path: '/settings/public', access: 'any' },
  { method: 'GET', path: '/settings/staff', access: ['admin', 'mentor'] },
  // ADR-0012 — programs: templates, runs, enrollments (Coach Office sprint 3)
  { method: 'GET', path: '/program-templates', access: ['admin', 'mentor'] },
  { method: 'POST', path: '/program-templates', access: ['admin', 'mentor'] },
  { method: 'GET', path: '/program-templates/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'PATCH', path: '/program-templates/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'DELETE', path: '/program-templates/[id]', access: ['admin', 'mentor'], scoped: true },
  {
    method: 'POST',
    path: '/program-templates/[id]/publish',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'POST',
    path: '/program-templates/[id]/archive',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'POST',
    path: '/program-templates/[id]/restore',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'POST',
    path: '/program-templates/[id]/duplicate',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'POST',
    path: '/program-templates/[id]/submit',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  { method: 'POST', path: '/program-templates/[id]/approve', access: ['admin'], scoped: true },
  { method: 'POST', path: '/program-templates/[id]/reject', access: ['admin'], scoped: true },
  {
    method: 'POST',
    path: '/program-templates/[id]/nodes',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'PUT',
    path: '/program-templates/[id]/nodes/order',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'PATCH',
    path: '/program-templates/[id]/nodes/[nodeId]',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'DELETE',
    path: '/program-templates/[id]/nodes/[nodeId]',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  { method: 'GET', path: '/program-runs', access: ['admin', 'mentor'] },
  { method: 'POST', path: '/program-runs', access: ['admin', 'mentor'] },
  { method: 'GET', path: '/program-runs/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'PATCH', path: '/program-runs/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/program-runs/[id]/staff', access: ['admin', 'mentor'], scoped: true },
  {
    method: 'DELETE',
    path: '/program-runs/[id]/staff/[userId]',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'POST',
    path: '/program-runs/[id]/enrollments',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  { method: 'PATCH', path: '/enrollments/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'PUT', path: '/enrollments/[id]/phase', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/students/[id]/enrollments', access: ['admin', 'mentor'], scoped: true },
  { method: 'GET', path: '/me/programs', access: ['student'] },
  // Coach Office sprint 4 — mentor relationship and directory
  { method: 'GET', path: '/enrollments/[id]/mentors', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/enrollments/[id]/mentors', access: ['admin'], scoped: true },
  {
    method: 'DELETE',
    path: '/enrollments/[id]/mentors/[userId]',
    access: ['admin'],
    scoped: true,
  },
  { method: 'GET', path: '/mentors/directory', access: ['admin', 'mentor'] },
  { method: 'GET', path: '/mentors/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'PUT', path: '/mentors/[id]/profile', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/mentors/[id]/transfer', access: ['admin'], scoped: true },
  // Coach Office sprint 5 — program assignments and progress
  {
    method: 'POST',
    path: '/program-runs/[id]/nodes/[nodeId]/assign',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'PUT',
    path: '/enrollments/[id]/nodes/[nodeId]/completion',
    access: ['admin', 'mentor', 'student'],
    scoped: true,
  },
  // Coach Office sprint 5b — sessions and goals
  { method: 'GET', path: '/sessions', access: ['admin', 'mentor', 'student'], scoped: true },
  { method: 'POST', path: '/sessions', access: ['admin', 'mentor'], scoped: true },
  { method: 'PATCH', path: '/sessions/[id]', access: ['admin', 'mentor'], scoped: true },
  { method: 'POST', path: '/sessions/[id]/actions', access: ['admin', 'mentor'], scoped: true },
  {
    method: 'GET',
    path: '/enrollments/[id]/goals',
    access: ['admin', 'mentor', 'student'],
    scoped: true,
  },
  { method: 'POST', path: '/enrollments/[id]/goals', access: ['admin', 'mentor'], scoped: true },
  { method: 'PATCH', path: '/goals/[id]', access: ['admin', 'mentor'], scoped: true },
  // Coach Office sprint 7 — bookable hours and booking requests
  { method: 'GET', path: '/mentors/[id]/availability', access: ['admin', 'mentor'], scoped: true },
  { method: 'PUT', path: '/mentors/[id]/availability', access: ['admin', 'mentor'], scoped: true },
  {
    method: 'PUT',
    path: '/mentors/[id]/offerings/[templateId]',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'GET',
    path: '/mentors/[id]/slots',
    access: ['admin', 'mentor', 'student'],
    scoped: true,
  },
  { method: 'GET', path: '/booking/mentors', access: ['student'], scoped: true },
  {
    method: 'GET',
    path: '/booking-requests',
    access: ['admin', 'mentor', 'student'],
    scoped: true,
  },
  { method: 'POST', path: '/booking-requests', access: ['student'], scoped: true },
  {
    method: 'POST',
    path: '/booking-requests/[id]/approve',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  {
    method: 'POST',
    path: '/booking-requests/[id]/decline',
    access: ['admin', 'mentor'],
    scoped: true,
  },
  { method: 'POST', path: '/booking-requests/[id]/cancel', access: ['student'], scoped: true },
];
