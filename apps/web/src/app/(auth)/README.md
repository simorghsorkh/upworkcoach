# (auth) — sign-in pages

A route group with no URL prefix and no session: `/login` (G1), `/invite` and `/reset` (G2/G3, one component; the token lives only in the URL fragment, security C1), `/forgot` (G4, guidance only).
The components are in `src/components/auth/`. References: `docs/03-ux/sitemap.md` section 2, `docs/04-architecture/api.md` section 2 and ADR-0003.
