# (student) — student pages

Shell: `src/components/shell/student-shell.tsx` (top bar with five items on desktop, bottom bar on mobile). `layout.tsx` uses `requireUser(['student'])`.
Only student-specific DTOs that carry no internal fields (tech-stack.md section 3, rule 4). Goal: home loads in under 3 seconds on 3G; little client-side JS. Pages are currently "coming soon".
