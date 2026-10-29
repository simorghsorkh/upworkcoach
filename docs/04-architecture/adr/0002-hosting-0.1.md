# ADR-0002 — Hosting for version 0.1: Azure or Vercel

- **Status:** Proposed (awaiting founder gate)
- **Date:** 27 Mehr 1405 (2026-10-19)
- **Author:** software-architect
- **Input:** Founder decision (27 Mehr 1405, via the project lead): "For now I'll bring the server up on Vercel or Azure."
- **Related:** ADR-0001 (stack), ADR-0006 (AI layer), ADR-0007 (background jobs)

---

## 1. Context

- The founder has decided that 0.1 will be hosted on **Vercel or Azure**. This ADR chooses between the two and states the risks explicitly.
- 0.1 is for 30 to 80 students, 1 admin and 2 to 4 mentors (assumption A1). The load is very low.
- 0.1 needs scheduled jobs: hourly recomputation of health status (ADR-0005) and cleanup of sessions and tokens. Reminders in 0.1 are in-app only and do not need a job (ADR-0005, section 6).
- Image attachments up to 5 MB are a "Should" in 0.1 (PRD, F4).
- There is one developer, and simple maintenance matters.

### Conflict with the PRD (resolved in this ADR)
The PRD (section 8 and assumption A4) and `mvp-scope.md` say: "0.1 has no dependency on external services and is **hostable in Iran**". With the founder's decision, this requirement **no longer holds**. From this ADR on, the architectural requirement is:

> **0.1 is portable to an Iranian host**: whenever needed, the same Docker image, the same standard Postgres and the same code come up on an Iranian server without a rewrite (section 6).

The PRD itself was not edited. The project lead must record this change in `STATUS.md`. The requirement "no CDN and no fonts from external services" still holds, because the user's browser must not depend on any other external domain (every extra domain is one more point that can be filtered).

---

## 2. Options

### Option A — Azure: App Service (Linux container) + Azure Database for PostgreSQL Flexible Server + Azure Blob Storage
- The app is one **Docker image** (Next.js with `standalone` output) running on App Service Linux, plan B1, with "Always On".
- The process is long-running, so the **pg-boss** queue and scheduler run inside the same process (ADR-0007). No dedicated Azure scheduling service is needed.
- Database: Flexible Server, Burstable tier, size **B1ms** (1 vCore, 2 GB RAM), 32 GB disk, 7-day automatic backups.
- Files: Blob Storage, behind an adapter (section 6).

### Option B — Vercel Pro + Neon Postgres (from the Vercel Marketplace) + Vercel Blob
- Next.js runs as serverless functions (Fluid compute).
- Scheduling with **Vercel Cron**, which calls an endpoint. A persistent queue (pg-boss worker) is not possible, because there is no always-on process.
- Database: Neon (serverless, scale-to-zero), with a pooler for serverless connections.

---

## 3. Comparison

| Criterion | A — Azure | B — Vercel + Neon |
|---|---|---|
| **Managed Postgres** | Flexible Server B1ms; standard Postgres; automatic backups; extensions (`pg_trgm`, `unaccent`) are enabled via the `azure.extensions` parameter | Neon; standard Postgres; Launch plan with up to 7 days of restore; the free plan has only 6 hours of restore, which is too little for real data |
| **Scheduled jobs** | In-process with pg-boss (cron with the `Asia/Tehran` time zone); no extra service | Vercel Cron: on Hobby only **once a day** and with ±59 minutes precision; on Pro every minute ([Vercel docs](https://vercel.com/docs/cron-jobs/usage-and-pricing), updated 2026-07-15). Hourly health recomputation needs **Pro** |
| **Queue for 1.0 (LLM calls)** | The same pg-boss; persistent worker | No persistent worker; would need Vercel Workflows or Queues (a dedicated service) or a per-minute cron. **Lock-in** |
| **File storage** | Blob Storage. Its API is not S3-compatible, so an adapter is needed. Uploads go through the server and there is no size limit | Vercel Blob (proprietary API). The request body to a function is at most **4.5 MB** ([Vercel docs](https://vercel.com/docs/functions/limitations), updated 2026-08-24). A 5 MB attachment must go directly from the browser to Blob, i.e. a second upload path and proprietary code |
| **Portability** | **High**: the same Docker image runs on any Iranian VPS with Docker Compose | Medium: the Next.js code is portable, but Cron, Blob and the serverless settings must be replaced |
| **Setup and maintenance** | Medium: one-time setup of App Service, the image registry and the database. After that, deployment by push to CI | **Very simple**: git push = deploy; a preview for every branch |
| **Number of external accounts** | 1 (Microsoft) | 2 (Vercel and Neon), each with its own sanctions terms |
| **Commercial use** | Allowed | Hobby is only "personal or non-commercial" ([Vercel Terms](https://vercel.com/legal/terms), section 4, updated 2026-06-01). So **Pro is required** |
| **Region proximity to Iran** | The UAE North (Dubai) region exists and B1ms is available there ([Bytebase](https://www.bytebase.com/dbcost/azure-flexible/instance/B1ms/)). Real latency from Iran **not measured** | Vercel and Neon have a European region (Frankfurt). Real latency not measured |

### Monthly cost for 30 to 80 students (checked 27 Mehr 1405 / 2026-10-19)

**A — Azure**

| Item | Monthly (USD) | Source and notes |
|---|---|---|
| App Service Linux B1 (1 core, 1.75 GB RAM) | ≈ 13.14 | [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/a/12322935) (November 2025) and [Kuberns](https://kuberns.com/blogs/azure-pricing/) (June 2026). The official pricing page did not show the figure, so it was **not officially confirmed** |
| PostgreSQL Flexible B1ms (compute only) | 12 to 15 (UAE North and Germany West Central: 15; North Europe: 13) | [Bytebase](https://www.bytebase.com/dbcost/azure-flexible/instance/B1ms/), updated 2026-10-19 |
| 32 GB database disk | ≈ 4 (estimate) | The per-GB price was **not confirmed** from an official source |
| Database backup | 0 | Free up to 100% of the disk size ([Microsoft Learn](https://learn.microsoft.com/en-gb/azure/postgresql/flexible-server/concepts-backup-restore)) |
| Blob Storage (under 5 GB) | under 1 (estimate) | **Not confirmed**; negligible at this volume |
| Image registry | 0 | GitHub Container Registry (see ADR-0001) |
| **Total** | **≈ 30 to 35 USD** | At the open-market dollar rate of about 229 thousand toman ([Nabz-e Bourse](https://nabzebourse.com/fa/news/137940/قیمت-دلار-امروز-چهارشنبه-25-شهریورماه-1405-کاهش-قیمت-دلار-در-بازار-آزاد-نرخ-یورو-و-درهم), 25 Shahrivar 1405 (2026-09-16); the Mehr rate was not confirmed): **≈ 7 to 8 million toman** |

A free Azure account includes B1ms with a free 32 GB disk for 12 months ([Microsoft Learn](https://learn.microsoft.com/en-ie/azure/postgresql/flexible-server/how-to-deploy-on-azure-free-account)). If the account is eligible, the first-year cost is lower, but we have not counted on it.

**B — Vercel + Neon**

| Item | Monthly (USD) | Source |
|---|---|---|
| Vercel Pro (1 developer seat) | 20, including 20 USD of usage credit | [vercel.com/pricing](https://vercel.com/pricing) |
| Functions and traffic | ≈ 0 (within the credit) | Same |
| Neon Launch | 5 to 20: 0.106 USD per CU-hour, 0.35 USD per GB. Minimum 0.25 CU, always on ≈ 19 USD; less with scale-to-zero | [neon.com/pricing](https://neon.com/pricing) (no date on the page) |
| Vercel Blob | under 1 (0.023 USD per GB) | [vercel.com/pricing](https://vercel.com/pricing) |
| **Total** | **≈ 25 to 40 USD** | ≈ 6 to 9 million toman |

**Cost conclusion:** The two options cost about the same. Cost is not the deciding criterion; architecture and portability are.

---

## 4. Risks (shared by both options, unless stated otherwise)

| # | Risk | Evidence | Evidence status | Mitigation |
|---|---|---|---|---|
| H1 | **International internet shutdown = the platform becomes unreachable for Iranian users.** During a shutdown, only services inside the National Information Network (NIN) are reachable | According to NetBlocks, the general public had been cut off from the global internet for **70% of 2026** up to Ordibehesht 1405; most people had access only to services inside the NIN ([The National](https://www.thenationalnews.com/future/technology/2026/05/07/iran-internet-blackout/), 7 May 2026). The 88-day blackout was "partially" lifted in late May 2026 ([Al-Monitor](https://www.al-monitor.com/originals/2026/05/iran-partially-restores-internet-after-88-day-blackout-what-know)) | Status as of Mehr 1405 **not confirmed** | Encrypted daily backup **inside Iran** + exit plan (section 6) |
| H2 | **Iranian users' access to Vercel domains** | A user on the Vercel forum (June 2025) reported that their site on Vercel would not open from Iran and did not know whether the cause was domestic filtering or blocking by Vercel. No reply from Vercel is recorded ([Vercel Community](https://community.vercel.com/t/website-not-accessible-need-clarification-on-ip-restrictions/12398)). Vercel has a firewall template for blocking sanctioned countries that the customer enables themselves ([Vercel Templates](https://vercel.com/templates/other/block-ofac-sanctioned-countries-firewall-rule)); this suggests blocking is not the default, but it is **not confirmed**. Persian tutorials teach using Vercel as a filter-circumvention tool ([example](https://www.youtube.com/watch?v=nmNJuxErGII)); it is our **inference** that this raises the likelihood of Vercel infrastructure being filtered | **Not confirmed** | Access test before committing (section 5) |
| H3 | **Iranian users' access to Azure domains** (`*.azurewebsites.net`) | No evidence found of filtering or geo-blocking of websites hosted on Azure | **Not confirmed** | Access test (section 5) |
| H4 | **Effect of a custom domain** | If filtering is by domain name (SNI/DNS), a custom domain helps. If it is by IP, it does not help, because the custom domain sits on the same shared provider IPs. The filtering method for these two services | **Not confirmed** | **A custom domain is used in any case** (e.g. `app.<domain>.ir` or `.com`), because it makes a later migration possible without changing links |
| H5 | **Terms of use and sanctions (account)** | Vercel: the customer declares that they are not "the target of sanctions by OFAC, the US State Department, the Security Council, the European Union, etc." (section 14.1(vi), [Vercel Terms](https://vercel.com/legal/terms), 2026-06-01). Azure: an official Microsoft Q&A (2022) states that Iranian users do not have access to Azure and that Microsoft is "looking into it" ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/1036368/sanctions-iran-2022)). Status in 2026 | Azure: **not confirmed**; Vercel: sanctions clause confirmed | This ADR does not propose any way to circumvent the provider's terms. **The account owner and payment method must comply with the provider's terms** (open question Q1). The risk of the account being suspended without warning is reduced by a backup outside the provider |
| H6 | **Payment** | Both require an international card | — | Open question Q1 |
| H7 | **Domestic law on storing Iranian users' data abroad** | Not investigated | **Not confirmed** | Open question Q2 (legal advice) |
| H8 | **Developer access to the dashboards** | The Azure or Vercel dashboard may not open from an Iranian IP | **Not confirmed** | Deployment is done from CI (GitHub Actions), not from the dashboard |

### Shared advantage: the AI layer in 1.0 becomes simpler
The server is outside Iran, so **network-wise** it connects directly to language model APIs (Anthropic, etc.) and no relay server is needed. But this only solves the network problem. The LLM provider's terms of use regarding the customer's location (risk R1) still remain (ADR-0006).

---

## 5. Prerequisite: access test (half a day, first week)

Because risks H2 to H4 are **not confirmed**, this test is run before building (owner: devops-engineer):

1. A "hello" page and a `/healthz` endpoint (with one database query) are brought up on **both** options: with the default domain and with a custom domain.
2. They are opened from at least three connections inside Iran and **without a VPN**: Hamrah-e Aval, Irancell, and one fixed-line connection. If Azure is chosen, two regions (UAE North and Germany West Central) are tested separately.
3. Record: whether it opened, initial load time, and `/healthz` latency.
4. **Decision rule:** The option that opens from all three connections with the custom domain is chosen. If both open, the recommendation in section 7 is followed. If neither opens, it is reported to the project lead so that the founder can decide again (the Iranian path, section 6).

---

## 6. Portability: mandatory rules (for both options)

| Rule | Why |
|---|---|
| The app is **one Docker image** (Next.js `output: 'standalone'`) and runs with `docker run` on any Linux | Migration = running the same image |
| All configuration comes from **environment variables** (`DATABASE_URL`, `STORAGE_DRIVER`, `APP_BASE_URL`, `DEVICE_COOKIE_SECRET`, `TRUSTED_PROXY_HOPS`, …; (security C7, aligned with code, sprint 1) `SESSION_SECRET` was removed, because the session token is random and hashed; the full list is in `tech-stack.md` section 5 and `.env.example`) | No code changes |
| The database is **standard Postgres** (version 16 or later). Only common extensions: `pg_trgm`, `unaccent`, `citext`. No Azure- or Neon-specific features | `pg_dump` / `pg_restore` works on any Postgres |
| Scheduling and queues with **pg-boss inside Postgres** (ADR-0007), not Vercel Cron or an Azure service | The scheduler moves with the data |
| Files sit behind a **`FileStorage`** interface with two adapters: `azure-blob` and `s3` (for MinIO or Iranian S3-compatible storage) | Migration = changing `STORAGE_DRIVER` and copying the files |
| File uploads and downloads go **through our server** (not a direct signed link) | Access control in one place; no special CORS setup |
| Logs to stdout in JSON format (pino); no proprietary monitoring SDK (Application Insights and Vercel Analytics) | Every host captures stdout logs |
| The font (Vazirmatn) and all assets are served from our own domain | No browser dependency on an external domain |
| **Daily backup**: encrypted `pg_dump` (with `age`) + files, in two places: (1) the provider's storage, (2) **a destination inside Iran** that "pulls" it from inside Iran (e.g. an Iranian VPS or object storage that downloads the file every night) | During an international shutdown or account suspension, the latest copy of the data exists inside Iran |
| A **migration runbook** that is rehearsed on a test VPS once every 3 months | An untested migration is not a migration |

**Recovery target after an emergency migration:** RPO = 24 hours (data after the last backup that reached Iran is lost, or is not visible until the connection is restored), RTO = 1 business day.

**Future migration path (one line):** A cloud VPS inside Iran with Docker Compose (app + Postgres + MinIO), e.g. Liara 2 vCPU / 4 GB for 2,650,000 toman per month ([liara.ir/pricing](https://liara.ir/pricing/), 27 Mehr 1405); ParsPack and Arvan are equivalent options.

---

## 7. Decision

**Option A — Azure** is recommended:
- **App Service Linux B1** (container, Always On)
- **Azure Database for PostgreSQL Flexible Server B1ms** (32 GB, 7-day backups, no HA)
- **Blob Storage** (LRS, Hot tier)
- Region: based on the test in section 5. If both open and UAE North has lower latency, **UAE North**; otherwise **Germany West Central**. The app and the database are in the same region.
- Image registry: GitHub Container Registry. Deployment from GitHub Actions.

### Why Azure and not Vercel
1. **Long-running process.** The queue and scheduler (pg-boss) work without a dedicated service. In 1.0 the same queue manages LLM calls with retries and quotas (ADR-0006). On Vercel we would depend on Vercel Workflows/Queues for the same job.
2. **Portability.** What runs on Azure (Docker image + Postgres) is exactly what runs on an Iranian server. Given H1, this is the most important criterion.
3. **One external account instead of two.** Vercel + Neon has two contracts and two sanctions clauses.
4. Vercel's **4.5 MB limit** conflicts with the PRD's 5 MB attachment.
5. The UAE North region **may** have lower latency to Iran (not measured).

### What we give up
- The simplicity of Vercel's "push = deploy" and automatic previews. This is compensated by a simple GitHub Actions workflow (build image → push to GHCR → update App Service). devops-engineer writes the details.
- About half a day of extra initial setup.

### If the founder prefers Vercel
The architecture allows it, with these changes: (1) Vercel **Pro** (not Hobby); (2) Neon Launch in Frankfurt with `fra1` as the functions region; (3) scheduler: Vercel Cron calls `POST /api/internal/jobs/:name` every hour with the `X-Job-Secret` header (this endpoint is built from the start; ADR-0007); (4) a `vercel-blob` adapter and direct upload from the browser for files over 4 MB; (5) the 1.0 queue question is re-examined in a separate ADR.

---

## 8. Consequences

- devops-engineer: the test in section 5, infrastructure as code (Bicep or Terraform, simple), CI/CD, two-location backups, the migration runbook, uptime monitoring from **inside Iran** (a simple check from an Iranian VPS, because an external monitor does not see an Iranian shutdown).
- backend-engineer: follows the rules in section 6; no Azure-specific SDK except inside the `azure-blob` adapter.
- security-reviewer: review of H5 and H7 and key management (Key Vault is not needed; App Service settings and GitHub secrets are enough).
- If an international shutdown lasts long (proposal: more than 72 hours, or whenever the founder says so), the migration runbook is executed.

## 9. Open questions (founder only)
- **Q1:** In whose name and from where are the Azure (or Vercel) account and payment method? Do they comply with the provider's terms? (H5, H6)
- **Q2:** Have you obtained legal advice about storing Iranian users' data on a foreign server? (H7)
- **Q3:** The threshold for executing an emergency migration during an internet shutdown (proposal: 72 hours) and the backup destination inside Iran (an Iranian VPS or object storage; about 0.5 to 1 million toman per month).
