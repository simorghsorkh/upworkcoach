import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import * as adminRecompute from '@/app/api/v1/admin/health/recompute/route';
import * as attachmentById from '@/app/api/v1/attachments/[id]/route';
import * as attachmentsUpload from '@/app/api/v1/attachments/route';
import * as changePassword from '@/app/api/v1/auth/change-password/route';
import * as login from '@/app/api/v1/auth/login/route';
import * as logout from '@/app/api/v1/auth/logout/route';
import * as me from '@/app/api/v1/auth/me/route';
import * as switchOrganization from '@/app/api/v1/auth/organization/route';
import * as myOrganizations from '@/app/api/v1/auth/organizations/route';
import * as preferences from '@/app/api/v1/auth/preferences/route';
import * as reauth from '@/app/api/v1/auth/reauth/route';
import * as sessionById from '@/app/api/v1/auth/sessions/[id]/route';
import * as sessionsList from '@/app/api/v1/auth/sessions/route';
import * as tokensAccept from '@/app/api/v1/auth/tokens/accept/route';
import * as tokensLookup from '@/app/api/v1/auth/tokens/lookup/route';
import * as board from '@/app/api/v1/board/route';
import * as bookingMentors from '@/app/api/v1/booking/mentors/route';
import * as bookingApprove from '@/app/api/v1/booking-requests/[id]/approve/route';
import * as bookingCancel from '@/app/api/v1/booking-requests/[id]/cancel/route';
import * as bookingDecline from '@/app/api/v1/booking-requests/[id]/decline/route';
import * as bookingRequests from '@/app/api/v1/booking-requests/route';
import * as cannedResponseById from '@/app/api/v1/canned-responses/[id]/route';
import * as cannedResponses from '@/app/api/v1/canned-responses/route';
import * as northStar from '@/app/api/v1/dashboard/north-star/route';
import * as orgDashboard from '@/app/api/v1/dashboard/organization/route';
import * as enrollmentGoals from '@/app/api/v1/enrollments/[id]/goals/route';
import * as enrollmentMentorById from '@/app/api/v1/enrollments/[id]/mentors/[userId]/route';
import * as enrollmentMentors from '@/app/api/v1/enrollments/[id]/mentors/route';
import * as enrollmentNodeCompletion from '@/app/api/v1/enrollments/[id]/nodes/[nodeId]/completion/route';
import * as enrollmentPhase from '@/app/api/v1/enrollments/[id]/phase/route';
import * as enrollmentById from '@/app/api/v1/enrollments/[id]/route';
import * as exportMilestones from '@/app/api/v1/exports/milestones.csv/route';
import * as exportStudents from '@/app/api/v1/exports/students.csv/route';
import * as exportTasks from '@/app/api/v1/exports/tasks.csv/route';
import * as flagClear from '@/app/api/v1/flags/[id]/clear/route';
import * as goalById from '@/app/api/v1/goals/[id]/route';
import * as importStudents from '@/app/api/v1/imports/students/route';
import * as invitations from '@/app/api/v1/invitations/route';
import * as meCheckinCurrent from '@/app/api/v1/me/checkins/current/route';
import * as meCheckins from '@/app/api/v1/me/checkins/route';
import * as meMilestones from '@/app/api/v1/me/milestones/route';
import * as mePath from '@/app/api/v1/me/path/route';
import * as meProfiles from '@/app/api/v1/me/profiles/route';
import * as mePrograms from '@/app/api/v1/me/programs/route';
import * as meQuestions from '@/app/api/v1/me/questions/route';
import * as meSharedNotes from '@/app/api/v1/me/shared-notes/route';
import * as meStudent from '@/app/api/v1/me/student/route';
import * as meTasks from '@/app/api/v1/me/tasks/route';
import * as mentorAvailability from '@/app/api/v1/mentors/[id]/availability/route';
import * as mentorOffering from '@/app/api/v1/mentors/[id]/offerings/[templateId]/route';
import * as mentorProfile from '@/app/api/v1/mentors/[id]/profile/route';
import * as mentorById from '@/app/api/v1/mentors/[id]/route';
import * as mentorSlots from '@/app/api/v1/mentors/[id]/slots/route';
import * as mentorTransfer from '@/app/api/v1/mentors/[id]/transfer/route';
import * as mentorDirectory from '@/app/api/v1/mentors/directory/route';
import * as mentors from '@/app/api/v1/mentors/route';
import * as milestoneTypeById from '@/app/api/v1/milestone-types/[id]/route';
import * as milestoneTypes from '@/app/api/v1/milestone-types/route';
import * as milestoneApprove from '@/app/api/v1/milestones/[id]/approve/route';
import * as milestoneReject from '@/app/api/v1/milestones/[id]/reject/route';
import * as noteById from '@/app/api/v1/notes/[id]/route';
import * as notificationsRead from '@/app/api/v1/notifications/read/route';
import * as notificationsRoute from '@/app/api/v1/notifications/route';
import * as platformById from '@/app/api/v1/platforms/[id]/route';
import * as platformsList from '@/app/api/v1/platforms/route';
import * as profileApprove from '@/app/api/v1/profiles/[id]/approve/route';
import * as profileById from '@/app/api/v1/profiles/[id]/route';
import * as profileSnapshots from '@/app/api/v1/profiles/[id]/snapshots/route';
import * as programRunEnrollments from '@/app/api/v1/program-runs/[id]/enrollments/route';
import * as runNodeAssign from '@/app/api/v1/program-runs/[id]/nodes/[nodeId]/assign/route';
import * as programRunById from '@/app/api/v1/program-runs/[id]/route';
import * as programRunStaffById from '@/app/api/v1/program-runs/[id]/staff/[userId]/route';
import * as programRunStaff from '@/app/api/v1/program-runs/[id]/staff/route';
import * as programRuns from '@/app/api/v1/program-runs/route';
import * as programTemplateApprove from '@/app/api/v1/program-templates/[id]/approve/route';
import * as programTemplateArchive from '@/app/api/v1/program-templates/[id]/archive/route';
import * as programTemplateDuplicate from '@/app/api/v1/program-templates/[id]/duplicate/route';
import * as programTemplateNodeById from '@/app/api/v1/program-templates/[id]/nodes/[nodeId]/route';
import * as programTemplateNodesOrder from '@/app/api/v1/program-templates/[id]/nodes/order/route';
import * as programTemplateNodes from '@/app/api/v1/program-templates/[id]/nodes/route';
import * as programTemplatePublish from '@/app/api/v1/program-templates/[id]/publish/route';
import * as programTemplateReject from '@/app/api/v1/program-templates/[id]/reject/route';
import * as programTemplateRestore from '@/app/api/v1/program-templates/[id]/restore/route';
import * as programTemplateById from '@/app/api/v1/program-templates/[id]/route';
import * as programTemplateSubmit from '@/app/api/v1/program-templates/[id]/submit/route';
import * as programTemplates from '@/app/api/v1/program-templates/route';
import * as questionAssignee from '@/app/api/v1/questions/[id]/assignee/route';
import * as questionClose from '@/app/api/v1/questions/[id]/close/route';
import * as questionMessages from '@/app/api/v1/questions/[id]/messages/route';
import * as questionById from '@/app/api/v1/questions/[id]/route';
import * as questionsList from '@/app/api/v1/questions/route';
import * as reminderDone from '@/app/api/v1/reminders/[id]/done/route';
import * as reminderById from '@/app/api/v1/reminders/[id]/route';
import * as reminderSnooze from '@/app/api/v1/reminders/[id]/snooze/route';
import * as remindersList from '@/app/api/v1/reminders/route';
import * as reviewQueue from '@/app/api/v1/review-queue/route';
import * as reviewById from '@/app/api/v1/reviews/[id]/route';
import * as sessionActions from '@/app/api/v1/sessions/[id]/actions/route';
import * as mentoringSessionById from '@/app/api/v1/sessions/[id]/route';
import * as sessionsRoot from '@/app/api/v1/sessions/route';
import * as settingByKey from '@/app/api/v1/settings/[key]/route';
import * as settingsPublic from '@/app/api/v1/settings/public/route';
import * as settingsAll from '@/app/api/v1/settings/route';
import * as settingsStaff from '@/app/api/v1/settings/staff/route';
import * as stageDeactivate from '@/app/api/v1/stages/[id]/deactivate/route';
import * as stageById from '@/app/api/v1/stages/[id]/route';
import * as stagesOrder from '@/app/api/v1/stages/order/route';
import * as stagesList from '@/app/api/v1/stages/route';
import * as stuck from '@/app/api/v1/stuck/route';
import * as studentCheckins from '@/app/api/v1/students/[id]/checkins/route';
import * as studentEnrollments from '@/app/api/v1/students/[id]/enrollments/route';
import * as studentFlags from '@/app/api/v1/students/[id]/flags/route';
import * as studentHealth from '@/app/api/v1/students/[id]/health/route';
import * as healthSnooze from '@/app/api/v1/students/[id]/health/snooze/route';
import * as studentLifecycle from '@/app/api/v1/students/[id]/lifecycle/route';
import * as studentMentor from '@/app/api/v1/students/[id]/mentor/route';
import * as studentMilestones from '@/app/api/v1/students/[id]/milestones/route';
import * as studentNotes from '@/app/api/v1/students/[id]/notes/route';
import * as studentProfiles from '@/app/api/v1/students/[id]/profiles/route';
import * as studentById from '@/app/api/v1/students/[id]/route';
import * as studentStage from '@/app/api/v1/students/[id]/stage/route';
import * as studentStageHistory from '@/app/api/v1/students/[id]/stage-history/route';
import * as studentSummary from '@/app/api/v1/students/[id]/summary/route';
import * as studentTasks from '@/app/api/v1/students/[id]/tasks/route';
import * as studentTimeline from '@/app/api/v1/students/[id]/timeline/route';
import * as studentsList from '@/app/api/v1/students/route';
import * as studentTags from '@/app/api/v1/students/tags/route';
import * as submissionReview from '@/app/api/v1/submissions/[id]/review/route';
import * as taskTemplateById from '@/app/api/v1/task-templates/[id]/route';
import * as taskTemplates from '@/app/api/v1/task-templates/route';
import * as taskCancel from '@/app/api/v1/tasks/[id]/cancel/route';
import * as taskExtend from '@/app/api/v1/tasks/[id]/extend/route';
import * as taskById from '@/app/api/v1/tasks/[id]/route';
import * as taskStart from '@/app/api/v1/tasks/[id]/start/route';
import * as taskSubmissions from '@/app/api/v1/tasks/[id]/submissions/route';
import * as tasksBulk from '@/app/api/v1/tasks/bulk/route';
import * as tasksList from '@/app/api/v1/tasks/route';
import * as today from '@/app/api/v1/today/route';
import * as tracksList from '@/app/api/v1/tracks/route';
import * as inviteLink from '@/app/api/v1/users/[id]/invite-link/route';
import * as resetLink from '@/app/api/v1/users/[id]/reset-link/route';
import * as userRole from '@/app/api/v1/users/[id]/role/route';
import * as userById from '@/app/api/v1/users/[id]/route';
import * as users from '@/app/api/v1/users/route';
import { SEED_IDS, seedIdsFor } from '@/modules/catalog/seed';
import { hashPassword } from '@/modules/identity/password';
import {
  DEFAULT_ORGANIZATION_ID,
  organizationMemberships,
  users as usersTable,
} from '@/modules/identity/schema';
import { students as studentsTable } from '@/modules/students/schema';
import { type Actor, legacyRole, type Role } from '@/server/auth/current-user';
import { type DbOrTx, getDb } from '@/server/db';

export const ORIGIN = 'https://app.test';
export const SESSION_COOKIE = '__Host-uc_session';
export const DEVICE_COOKIE = '__Host-uc_dev';

type Handler = (
  req: Request,
  ctx?: { params: Promise<Record<string, string>> },
) => Promise<Response>;

/** Every route module, keyed by its manifest path (see routes.manifest.ts). */
export const ROUTE_MODULES: Record<string, Partial<Record<string, Handler>>> = {
  '/auth/login': login,
  '/auth/logout': logout,
  '/auth/me': me,
  '/auth/change-password': changePassword,
  '/auth/sessions': sessionsList,
  '/auth/sessions/[id]': sessionById as Partial<Record<string, Handler>>,
  '/auth/tokens/lookup': tokensLookup,
  '/auth/tokens/accept': tokensAccept,
  '/invitations': invitations,
  '/users': users,
  '/mentors': mentors,
  '/users/[id]/invite-link': inviteLink as Partial<Record<string, Handler>>,
  '/users/[id]/reset-link': resetLink as Partial<Record<string, Handler>>,
  // followups F-02, F-06
  '/users/[id]': userById as Partial<Record<string, Handler>>,
  '/users/[id]/role': userRole as Partial<Record<string, Handler>>,
  '/auth/reauth': reauth,
  '/auth/organizations': myOrganizations,
  '/auth/organization': switchOrganization,
  '/auth/preferences': preferences,
  '/students': studentsList,
  '/students/[id]': studentById as Partial<Record<string, Handler>>,
  '/students/[id]/summary': studentSummary as Partial<Record<string, Handler>>,
  '/students/[id]/mentor': studentMentor as Partial<Record<string, Handler>>,
  '/students/[id]/lifecycle': studentLifecycle as Partial<Record<string, Handler>>,
  '/students/[id]/profiles': studentProfiles as Partial<Record<string, Handler>>,
  '/students/[id]/stage': studentStage as Partial<Record<string, Handler>>,
  '/students/[id]/stage-history': studentStageHistory as Partial<Record<string, Handler>>,
  '/me/student': meStudent,
  '/me/profiles': meProfiles,
  '/me/path': mePath,
  '/profiles/[id]': profileById as Partial<Record<string, Handler>>,
  '/profiles/[id]/approve': profileApprove as Partial<Record<string, Handler>>,
  '/profiles/[id]/snapshots': profileSnapshots as Partial<Record<string, Handler>>,
  '/stages': stagesList,
  '/stages/[id]': stageById as Partial<Record<string, Handler>>,
  '/stages/order': stagesOrder,
  '/stages/[id]/deactivate': stageDeactivate as Partial<Record<string, Handler>>,
  '/board': board,
  '/platforms': platformsList,
  '/platforms/[id]': platformById as Partial<Record<string, Handler>>,
  '/tracks': tracksList,
  // sprint 3
  '/students/[id]/tasks': studentTasks as Partial<Record<string, Handler>>,
  '/me/tasks': meTasks,
  '/tasks': tasksList,
  '/tasks/bulk': tasksBulk,
  '/tasks/[id]': taskById as Partial<Record<string, Handler>>,
  '/tasks/[id]/extend': taskExtend as Partial<Record<string, Handler>>,
  '/tasks/[id]/cancel': taskCancel as Partial<Record<string, Handler>>,
  '/tasks/[id]/start': taskStart as Partial<Record<string, Handler>>,
  '/tasks/[id]/submissions': taskSubmissions as Partial<Record<string, Handler>>,
  '/submissions/[id]/review': submissionReview as Partial<Record<string, Handler>>,
  '/reviews/[id]': reviewById as Partial<Record<string, Handler>>,
  '/review-queue': reviewQueue,
  '/task-templates': taskTemplates,
  '/task-templates/[id]': taskTemplateById as Partial<Record<string, Handler>>,
  '/students/[id]/notes': studentNotes as Partial<Record<string, Handler>>,
  '/notes/[id]': noteById as Partial<Record<string, Handler>>,
  '/me/shared-notes': meSharedNotes,
  '/students/[id]/timeline': studentTimeline as Partial<Record<string, Handler>>,
  '/reminders': remindersList,
  '/reminders/[id]': reminderById as Partial<Record<string, Handler>>,
  '/reminders/[id]/done': reminderDone as Partial<Record<string, Handler>>,
  '/reminders/[id]/snooze': reminderSnooze as Partial<Record<string, Handler>>,
  '/today': today,
  '/attachments': attachmentsUpload,
  '/attachments/[id]': attachmentById as Partial<Record<string, Handler>>,
  '/imports/students': importStudents,
  '/exports/students.csv': exportStudents,
  '/exports/tasks.csv': exportTasks,
  // sprint 4
  '/students/tags': studentTags,
  '/students/[id]/health': studentHealth as Partial<Record<string, Handler>>,
  '/students/[id]/health/snooze': healthSnooze as Partial<Record<string, Handler>>,
  '/students/[id]/flags': studentFlags as Partial<Record<string, Handler>>,
  '/flags/[id]/clear': flagClear as Partial<Record<string, Handler>>,
  '/stuck': stuck,
  '/admin/health/recompute': adminRecompute,
  '/questions': questionsList,
  '/me/questions': meQuestions,
  '/questions/[id]': questionById as Partial<Record<string, Handler>>,
  '/questions/[id]/messages': questionMessages as Partial<Record<string, Handler>>,
  '/questions/[id]/close': questionClose as Partial<Record<string, Handler>>,
  '/questions/[id]/assignee': questionAssignee as Partial<Record<string, Handler>>,
  '/canned-responses': cannedResponses,
  '/canned-responses/[id]': cannedResponseById as Partial<Record<string, Handler>>,
  '/me/checkins/current': meCheckinCurrent,
  '/me/checkins': meCheckins,
  '/students/[id]/checkins': studentCheckins as Partial<Record<string, Handler>>,
  '/milestone-types': milestoneTypes,
  '/milestone-types/[id]': milestoneTypeById as Partial<Record<string, Handler>>,
  '/students/[id]/milestones': studentMilestones as Partial<Record<string, Handler>>,
  '/me/milestones': meMilestones,
  '/milestones/[id]/approve': milestoneApprove as Partial<Record<string, Handler>>,
  '/milestones/[id]/reject': milestoneReject as Partial<Record<string, Handler>>,
  '/dashboard/north-star': northStar,
  '/dashboard/organization': orgDashboard,
  '/notifications': notificationsRoute,
  '/notifications/read': notificationsRead,
  '/exports/milestones.csv': exportMilestones,
  '/settings': settingsAll,
  '/settings/[key]': settingByKey as Partial<Record<string, Handler>>,
  '/settings/public': settingsPublic,
  '/settings/staff': settingsStaff,
  // Coach Office sprint 3 — programs (ADR-0012)
  '/program-templates': programTemplates,
  '/program-templates/[id]': programTemplateById as Partial<Record<string, Handler>>,
  '/program-templates/[id]/publish': programTemplatePublish as Partial<Record<string, Handler>>,
  '/program-templates/[id]/archive': programTemplateArchive as Partial<Record<string, Handler>>,
  '/program-templates/[id]/restore': programTemplateRestore as Partial<Record<string, Handler>>,
  '/program-templates/[id]/duplicate': programTemplateDuplicate as Partial<Record<string, Handler>>,
  '/program-templates/[id]/submit': programTemplateSubmit as Partial<Record<string, Handler>>,
  '/program-templates/[id]/approve': programTemplateApprove as Partial<Record<string, Handler>>,
  '/program-templates/[id]/reject': programTemplateReject as Partial<Record<string, Handler>>,
  '/program-templates/[id]/nodes': programTemplateNodes as Partial<Record<string, Handler>>,
  '/program-templates/[id]/nodes/order': programTemplateNodesOrder as Partial<
    Record<string, Handler>
  >,
  '/program-templates/[id]/nodes/[nodeId]': programTemplateNodeById as Partial<
    Record<string, Handler>
  >,
  '/program-runs': programRuns,
  '/program-runs/[id]': programRunById as Partial<Record<string, Handler>>,
  '/program-runs/[id]/staff': programRunStaff as Partial<Record<string, Handler>>,
  '/program-runs/[id]/staff/[userId]': programRunStaffById as Partial<Record<string, Handler>>,
  '/program-runs/[id]/enrollments': programRunEnrollments as Partial<Record<string, Handler>>,
  '/enrollments/[id]': enrollmentById as Partial<Record<string, Handler>>,
  '/enrollments/[id]/phase': enrollmentPhase as Partial<Record<string, Handler>>,
  '/students/[id]/enrollments': studentEnrollments as Partial<Record<string, Handler>>,
  '/enrollments/[id]/mentors': enrollmentMentors as Partial<Record<string, Handler>>,
  '/enrollments/[id]/mentors/[userId]': enrollmentMentorById as Partial<Record<string, Handler>>,
  '/sessions': sessionsRoot as Partial<Record<string, Handler>>,
  '/sessions/[id]': mentoringSessionById as Partial<Record<string, Handler>>,
  '/sessions/[id]/actions': sessionActions as Partial<Record<string, Handler>>,
  '/enrollments/[id]/goals': enrollmentGoals as Partial<Record<string, Handler>>,
  '/goals/[id]': goalById as Partial<Record<string, Handler>>,
  '/program-runs/[id]/nodes/[nodeId]/assign': runNodeAssign as Partial<Record<string, Handler>>,
  '/enrollments/[id]/nodes/[nodeId]/completion': enrollmentNodeCompletion as Partial<
    Record<string, Handler>
  >,
  '/mentors/directory': mentorDirectory,
  '/mentors/[id]': mentorById as Partial<Record<string, Handler>>,
  '/mentors/[id]/profile': mentorProfile as Partial<Record<string, Handler>>,
  '/mentors/[id]/transfer': mentorTransfer as Partial<Record<string, Handler>>,
  '/me/programs': mePrograms,
  '/mentors/[id]/availability': mentorAvailability as Partial<Record<string, Handler>>,
  '/mentors/[id]/offerings/[templateId]': mentorOffering as Partial<Record<string, Handler>>,
  '/mentors/[id]/slots': mentorSlots as Partial<Record<string, Handler>>,
  '/booking/mentors': bookingMentors,
  '/booking-requests': bookingRequests as Partial<Record<string, Handler>>,
  '/booking-requests/[id]/approve': bookingApprove as Partial<Record<string, Handler>>,
  '/booking-requests/[id]/decline': bookingDecline as Partial<Record<string, Handler>>,
  '/booking-requests/[id]/cancel': bookingCancel as Partial<Record<string, Handler>>,
};

/** Seeded ids (catalog seed runs in global-setup). */
export const SEEDED = SEED_IDS;

export type CallOptions = {
  body?: unknown;
  /** multipart/form-data body (the Request sets the boundary). */
  form?: FormData;
  /** Raw string body (overrides `body`). */
  rawBody?: string;
  cookies?: Record<string, string | undefined>;
  ip?: string;
  /** `null` → no Origin header. */
  origin?: string | null;
  contentType?: string | null;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  userAgent?: string;
};

export type CallResult = {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: JSON bodies of many shapes in tests.
  body: any;
  /** Raw response bytes (binary downloads). */
  bytes: Uint8Array;
  headers: Headers;
  setCookies: string[];
  cookies: Record<string, string>;
};

/** Calls a Route Handler the way Next.js does: a Request plus `{ params }`. */
export async function call(
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<CallResult> {
  const handler = ROUTE_MODULES[path]?.[method];
  if (!handler) throw new Error(`no handler for ${method} ${path}`);
  const params = options.params ?? {};
  const concretePath = path.replace(/\[(\w+)\]/g, (_, key: string) => params[key] ?? 'missing');
  const url = new URL(`/api/v1${concretePath}`, ORIGIN);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

  const headers = new Headers(options.headers);
  if (options.origin !== null) headers.set('origin', options.origin ?? ORIGIN);
  // Random client IP by default so throttle counters of unrelated tests never add up.
  headers.set('x-forwarded-for', options.ip ?? uniqueIp());
  headers.set('user-agent', options.userAgent ?? 'vitest-agent');
  const cookieHeader = Object.entries(options.cookies ?? {})
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  if (cookieHeader) headers.set('cookie', cookieHeader);

  let body: string | FormData | undefined;
  if (method !== 'GET' && options.form && options.rawBody === undefined) {
    body = options.form;
  } else if (method !== 'GET') {
    body =
      options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    if (body !== undefined && options.contentType !== null) {
      headers.set('content-type', options.contentType ?? 'application/json');
    }
    if (body !== undefined) headers.set('content-length', String(Buffer.byteLength(body)));
  }
  const req = new Request(url, { method, headers, body });
  const res = await handler(req, { params: Promise.resolve(params) });
  const isJson = (res.headers.get('content-type') ?? '').startsWith('application/json');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = isJson || bytes.byteLength === 0 ? new TextDecoder().decode(bytes) : '';
  const setCookies = res.headers.getSetCookie();
  const cookies: Record<string, string> = {};
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const index = pair?.indexOf('=') ?? -1;
    if (pair && index > 0) cookies[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return {
    status: res.status,
    body: text ? JSON.parse(text) : null,
    bytes,
    headers: res.headers,
    setCookies,
    cookies,
  };
}

/** Synthetic Iranian mobile in the test range +98900… (SEC-E2). */
export function uniquePhone(): string {
  return `+98900${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
}

export function localForm(e164: string): string {
  return `0${e164.slice(3)}`;
}

/** Random TEST-NET-2 address, so throttle keys of different tests never collide. */
export function uniqueIp(): string {
  return `198.51.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

export const DEFAULT_PASSWORD: Record<Role, string> = {
  admin: 'admin-long-passphrase-1',
  mentor: 'mentor-long-passphrase-1',
  student: 'student-pass-1',
};

export type TestUser = {
  id: string;
  phone: string;
  role: Role;
  password: string;
  displayName: string;
};

/** Inserts a user directly (fixture). Active users get a password hash. */
export async function createUser(
  role: Role,
  options: {
    status?: 'invited' | 'active' | 'disabled';
    password?: string;
    displayName?: string;
    /** Students only: primary mentor of the fixture's students row. */
    mentorId?: string | null;
    /** Students only: current stage (default: first seeded stage). */
    stageId?: string;
    /** Organization of the membership (default: the seeded default organization). */
    organizationId?: string;
  } = {},
): Promise<TestUser> {
  const status = options.status ?? 'active';
  const organizationId = options.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const password = options.password ?? DEFAULT_PASSWORD[role];
  const phone = uniquePhone();
  const displayName = options.displayName ?? `کاربر آزمایشی ${role}`;
  const passwordChangedAt = new Date(Date.now() - 60_000);
  const [row] = await getDb()
    .insert(usersTable)
    .values({
      role,
      // ADR-0011: "disabled" lives on the membership; users.status is the account state.
      status: status === 'disabled' ? 'active' : status,
      phone,
      displayName,
      passwordHash: status === 'invited' ? null : await hashPassword(password),
      passwordChangedAt: status === 'invited' ? null : passwordChangedAt,
    })
    .returning({ id: usersTable.id });
  if (!row) throw new Error('fixture insert failed');
  await getDb()
    .insert(organizationMemberships)
    .values({
      organizationId,
      userId: row.id,
      role: ORGANIZATION_ROLE[role],
      status: status === 'disabled' ? 'disabled' : 'active',
      disabledAt: status === 'disabled' ? new Date() : null,
    });
  if (role === 'student') {
    // A real student always has a students row (POST /students creates both).
    await getDb()
      .insert(studentsTable)
      .values({
        organizationId,
        userId: row.id,
        primaryMentorId: options.mentorId ?? null,
        currentStageId: options.stageId ?? seedIdsFor(organizationId).stages[0] ?? '',
        stageEnteredAt: new Date(),
        searchText: displayName,
      });
  }
  return { id: row.id, phone, role, password, displayName };
}

/** Disables or re-enables the membership (ADR-0011); "invited" is the account state. */
const ORGANIZATION_ROLE = { admin: 'admin', mentor: 'mentor', student: 'mentee' } as const;

/** An active membership for a user inserted directly (isolated-database tests). */
export async function addMembership(
  db: DbOrTx,
  userId: string,
  role: Role,
  organizationId = DEFAULT_ORGANIZATION_ID,
) {
  await db
    .insert(organizationMemberships)
    .values({ organizationId, userId, role: ORGANIZATION_ROLE[role] });
}

/** A service-level actor (ADR-0011: always inside one organization). */
export function actorOf(
  userId: string,
  role: Role,
  organizationId = DEFAULT_ORGANIZATION_ID,
): Actor {
  const organizationRole = ORGANIZATION_ROLE[role];
  return { userId, role: legacyRole(organizationRole), organizationId, organizationRole };
}

export async function setUserStatus(
  id: string,
  status: 'invited' | 'active' | 'disabled',
  organizationId = DEFAULT_ORGANIZATION_ID,
) {
  const disabled = status === 'disabled';
  if (!disabled) await getDb().update(usersTable).set({ status }).where(eq(usersTable.id, id));
  await getDb()
    .update(organizationMemberships)
    .set({ status: disabled ? 'disabled' : 'active', disabledAt: disabled ? new Date() : null })
    .where(
      and(
        eq(organizationMemberships.userId, id),
        eq(organizationMemberships.organizationId, organizationId),
      ),
    );
}

/** Logs in through the real endpoint and returns the cookies to send next time. */
export async function loginAs(user: TestUser, ip = uniqueIp()) {
  const res = await call('POST', '/auth/login', {
    body: { phone: user.phone, password: user.password },
    ip,
  });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const session = res.cookies[SESSION_COOKIE] ?? '';
  return {
    session,
    device: res.cookies[DEVICE_COOKIE] ?? '',
    cookies: { [SESSION_COOKIE]: session } as Record<string, string>,
  };
}

/** Extracts the token from `…/invite#t=<token>`. */
export function tokenFromUrl(url: string): string {
  const match = /#t=([A-Za-z0-9_-]+)$/.exec(url);
  if (!match?.[1]) throw new Error(`no token in ${url}`);
  return match[1];
}
