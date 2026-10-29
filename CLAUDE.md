# UpworkCoach — freelancing and Upwork coaching platform

## The original idea (in the founder's words)
The founder is a coach who teaches people to earn from freelancing and Upwork, and wants a platform where:
- **Students** can sign up, go through their learning path, and have their progress tracked.
- **Mentors** (several of them) answer students' questions, follow up on their work and move them forward.
- **Smart tools** are available, including:
  - Job review (is this posting worth applying to? risks, fit, price)
  - Proposal review (find the problems and suggest fixes)
  - Help finding the right niche
  - And other tools defined during discovery (profile review, pricing, …)

The full idea and its open questions are in `docs/00-idea/brief.md`.

## Important context (real constraints)
- Users are mostly **Iranian and Persian-speaking** → the user interface is **Persian and right-to-left (RTL)**, with Jalali (Solar Hijri) dates and a Persian font (e.g. Vazirmatn).
- A **responsive web app** that works well on **both desktop and mobile** (founder's decision).
- **Sanctions**: Stripe and many foreign services are not available to Iranian users; access to LLM APIs must be planned for in the architecture (e.g. a relay server or a rial-based intermediary).
- **Payments are out of scope for now** (founder's decision, 27 Mehr 1405 / 2026-10-19) until the revenue model is settled. Do not design payment pages, flows or tables; only leave room to add them later.
- Upwork content (job posts, proposals, profiles) is in English → the AI tools take English input and give their feedback **in Persian**.
- **Scraping Upwork is forbidden** (against its ToS). Users paste the tools' input themselves.

## Team (agents in `.claude/agents/`)
| Role | Agent | Responsibility |
|---|---|---|
| Project lead | `project-lead` | Coordinating phases, splitting work, keeping `docs/STATUS.md` up to date |
| Product strategist | `product-strategist` | Discovery, competitors, personas, revenue model, PRD and MVP scope |
| Upwork expert | `upwork-domain-expert` | Freelancing domain knowledge; criteria and checklists for the tools |
| Curriculum designer | `curriculum-designer` | Learning path, stages, assignments, student progress criteria |
| UX designer | `ux-designer` | User flows, wireframes, RTL design system |
| Software architect | `software-architect` | Stack, data model, architecture, ADRs |
| AI engineer | `ai-engineer` | Designing and building the AI tools, prompts, evaluation |
| Backend engineer | `backend-engineer` | API, database, authentication, roles, payments |
| Frontend engineer | `frontend-engineer` | Persian/RTL user interface, dashboards |
| QA engineer | `qa-engineer` | Test strategy, automated tests, acceptance criteria |
| Security reviewer | `security-reviewer` | Security, privacy, access control |
| DevOps engineer | `devops-engineer` | Infrastructure, CI/CD, deployment, monitoring |

## Way of working (phases)
Each phase has a **defined output** and ends with a **founder approval gate**. The next phase does not start without approval.

| Phase | Title | Main agents | Output (`docs/`) |
|---|---|---|---|
| 0 | Idea and discovery | product-strategist, upwork-domain-expert | `01-discovery/`: vision, personas, competitors, revenue model, risks, questions for the founder |
| 1 | Product definition | product-strategist, curriculum-designer, upwork-domain-expert | `02-product/`: PRD, MVP scope, learning path, tool rubrics |
| 2 | Experience design | ux-designer | `03-ux/`: flows, wireframes, design system |
| 3 | Architecture | software-architect, ai-engineer, security-reviewer, devops-engineer | `04-architecture/`: architecture, data model, API, ADRs, AI design |
| 4 | MVP build | backend, frontend, ai-engineer | Code in `apps/` and `packages/`, sprints in `05-delivery/` |
| 5 | Testing and quality | qa-engineer, security-reviewer | `06-quality/`: test and security reports |
| 6 | Deployment and beta | devops-engineer, product-strategist | `07-launch/`: launch, beta with real students, metrics |

## Shared team rules
- **Documentation in English** (founder's decision, 8 Aban 1405 / 2026-10-30), as are code, file names, code comments and commits. The product's user-facing text stays **Persian** (`messages/fa.json`, RTL) with English in `messages/en.json`. Replies to the founder are in Persian.
- Before starting, every agent reads `CLAUDE.md`, `docs/STATUS.md` and the output of the earlier phases.
- Important technical decisions are recorded as ADRs in `docs/04-architecture/adr/`.
- Assumptions are written down explicitly; anything only the founder knows is recorded as an **open question** in `docs/STATUS.md`, not guessed.
- A small, usable MVP first; "nice to have" features go to the backlog.
