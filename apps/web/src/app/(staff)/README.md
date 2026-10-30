# (staff) — admin and mentor pages

Shell: `src/components/shell/staff-shell.tsx` (dark sidebar on desktop, bottom bar with a "+" on mobile). `layout.tsx` uses `requireUser(['admin', 'mentor'])`; the `(admin)` sub-group (results, settings) is `admin` only.
Access is also checked in the services, not only in the layout (ADR-0004). Pages from later sprints are currently "coming soon".
