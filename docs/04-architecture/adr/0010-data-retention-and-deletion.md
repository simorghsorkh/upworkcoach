# ADR-0010 — Data retention and account deletion in 0.1: request by message, execution by admin CLI, anonymization

- **Status:** Proposed (awaiting the founder gate; question S1 in `security.md` section 10)
- **Date:** 28 Mehr 1405 (2026-10-20)
- **Author:** software-architect
- **Source:** `security.md` C5, R5 and section 7; PRD section 8 ("ability to delete the account"); `sitemap.md` S10
- **(Security C5)**

## Context
- The PRD requires "ability to delete the account", but the earlier design only had `disabled`. Page S10 has a "Request account deletion" button with no API or process behind it.
- Real data for 30 to 80 people is entered from day one and replicated in two backups (Azure and inside Iran). The combination "name + mobile + Upwork profile link" is sensitivity level 3 (`security.md` R1).
- The coach needs **history** for their work: North Star metrics, response time, number of reviews, the path through stages. These must not break when a student is deleted.
- In 0.1 **we have no notification system** (F18 is in 1.0). A request recorded in the database is seen by no one unless a queue is built for it.
- A deletion request will probably happen only a few times over the whole lifetime of 0.1.

## Options
| Option | Assessment |
|---|---|
| A. Self-service deletion with a button (endpoint `DELETE /me`) | A destructive, irreversible action via the web; can be abused with a stolen session or an unlocked phone; the coach's history is wiped without their knowledge. Rejected |
| B. A "Request deletion" button + endpoint + a request queue in admin settings | Endpoint, status column, queue page, and, since we have no notifications, an indicator in the menu. Too much for a few occurrences a year |
| **C. Request by message to the coach (the same channel as "Forgot password") + execution by admin CLI + anonymization** | Zero endpoints and zero new pages; the destructive action sits behind server-console access; structural history is kept |
| D. Physical deletion of all rows (`ON DELETE CASCADE`) | North Star metrics, response time and stage paths break; mentor messages in threads become orphaned. Rejected |

## Decision: option C
1. **Request:** The user messages the coach (Telegram, or a question in the app itself). The coach knows the user, so authenticating the request is not an issue. **Execution deadline: at most 30 days** from the request (awaiting founder approval, S1).
2. **Execution:** `pnpm admin:erase-user --id <uuid> --confirm "<displayName>" --requested-on YYYY-MM-DD` from the server console. The function `identity.service.eraseUser` **anonymizes** in one transaction: free text and any identifying or platform-account-related data is cleared or deleted; structure (IDs, statuses, dates, counters, stages, milestone type) is kept. The exact table-by-table mapping is in `data-model.md` section 6-2.
3. **Staff:** The same CLI; preconditions: not the last admin, and no student, open reminder or open question remains assigned to them. Their writing stays in student records with the author "Deleted user".
4. **Audit:** A `user.erased` row (with `requestedOn`) in `audit_log`, which is never deleted and is the source of the "deletions list" for re-running after a backup restore.
5. **Retention periods** (full table in `data-model.md` section 6-1): sessions and tokens until expiry + 7 days; `audit_log` 24 months and its IP 90 days; `pending` attachment 24 hours; backups at most 8 weeks; student data until account deletion. Automatic enforcement by extending `auth.cleanup` (ADR-0007), with no new job.
6. **S10 in 0.1: remove the "Request account deletion" button** and put a help text in its place, like G4 ("Forgot password"): «برای حذف حسابت به مربی پیام بده. ظرف حداکثر ۳۰ روز داده‌هایت پاک می‌شود؛ آمار بی‌نام می‌ماند.» ("To delete your account, message the coach. Your data will be erased within at most 30 days; statistics remain anonymous.") + a link to the privacy page. **Reason:** (a) a button that does nothing misleads the user into thinking their request was recorded; (b) a button that does something needs an endpoint and an admin queue (option B), and since 0.1 has no notifications, the request is not seen and the 30-day deadline passes; (c) the message channel is the same channel the coach checks every day. Updating the S10 row in `sitemap.md` is up to ux-designer (this ADR only records the decision).
7. **Privacy page** (short, SEC-F4): where data is stored (a server outside Iran + an encrypted backup inside), what is stored, the deletion deadline, and the fact that deleted data remains in encrypted backups for up to 8 weeks.

### Reconciliation with implementation (aligned with the code, sprints 1 to 4; 30 Mehr 1405 (2026-10-22))
- **CLI:** `pnpm admin:erase-user --id … --confirm "…" --requested-on YYYY-MM-DD` was built (sprint 1), and each sprint added its new tables to `eraseUser`; each module has its own `erasure.ts` file so that writes stay in the module that owns the table (sprints 2 to 4). The final table-by-table mapping in `data-model.md` 6-2 matches the code.
- **Constant value instead of `null`:** every column with a "required" CHECK (`stage_transitions.note`, `task_extensions.reason`, `mentor_assignments.reason`, and (sprint 3) `tasks.cancel_reason`) gets the value `'[حذف شد]'` ("[deleted]") instead of `null`.
- **Staff deletion preconditions (sprints 2 to 4):** rejected if they are the last active admin, or the primary mentor of a non-deleted student, or have an open reminder, or are the assignee of an open question.
- **Files:** deleted after commit; if a file deletion fails, its row remains as an old `pending` row and `files.cleanup` retries (instead of "re-running the CLI" in item 2). Accepted: it is automatic and does not depend on the admin.
- **Token retention (sprint 1 open question):** the "expiry or consumption + 7 days" period remains **unchanged**. For SEC-T5, two columns `users.invite_accepted_at` and `users.invite_accepted_user_agent` are added (ADR-0003 item 9-9; F-01), and `eraseUser` sets the User-Agent column to `null`.
- **Remaining:** the privacy page (item 7, SEC-F4) has not been built yet, and `/invite` has only one line about seeing the information (F-12).

## Consequences
- **Positive:** The PRD requirement is met with minimal code (one CLI and one service function); no destructive action is available from the web; the coach's statistics and history stay intact; the `users.erased_at` column and the anonymization contract are ready for 1.0.
- **Negative:** The admin must run the CLI from the server console (requires technical access). Requests are recorded outside the system, and tracking the 30-day deadline is up to the admin. Deleted data remains in backups for up to 8 weeks.
- **Testing (owners: backend-engineer, qa-engineer):** after `eraseUser`, a canary test with the mobile number, name, profile link and student submission text across all tables (`SELECT` over all text columns) finds nothing; the North Star dashboard shows the same number as before; re-running is idempotent; the CLI errors for a mentor who still has students.
- **1.0:** If the number of users grows or public sign-up arrives (F16), option B (request from inside the app + admin queue + notification) replaces this with a new ADR. `eraseUser` stays the same. AI tools must respect `ai_use_consent`, `erased_at` and consent withdrawal before any use of data.
