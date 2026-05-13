# DecisionDeck — Build Phases

This document records the agreed build order and rationale. It supplements
`DecisionDeck.md` and is the authoritative source for phase scope and sequencing.

---

## Guiding Principle

**Make sense of the present before building governance layers.**

An EM with 387 synced work items and 18 engineers cannot govern what they cannot
see clearly. Triage and velocity signal come before decision authoring. Decisions
are the layer that *explains* the patterns triage surfaces — not the starting point.

The build order follows the EM's real weekly rhythm:
understand what is happening → understand what moved → decide what to focus on →
record the principles behind those decisions → report and review.

---

## Phase 0 — Project Foundation ✅

**Goal:** Running app shell with database, navigation, and seed decisions.

### Scope
- Next.js + TypeScript (App Router), SQLite + Drizzle ORM
- App shell layout with navigation
- Vitest setup
- Seed script with 11 initial DEC decisions
- `lib/env.ts` for Zod-validated environment variables

### Seed decisions
```
DEC-001: DecisionDeck is local-first
DEC-002: DecisionDeck must not rank individual engineers
DEC-003: Every metric needs interpretation notes
DEC-004: Risky work should link to relevant decisions
DEC-005: Weekly reports distinguish facts from interpretation
DEC-006: Human approval is required before committing durable decisions
DEC-007: Auth changes require rollback plans
DEC-008: Billing events must be idempotent
DEC-009: Audit logs are append-only
DEC-010: Production permission changes require two reviewers
DEC-011: Deployment rollback must be tested before release
```

### Non-goals
- No external integrations, no authentication, no analytics

---

## Phase 1 — GitHub Integration ✅

**Goal:** Pull real engineering signals from GitHub via the GH CLI.

### Scope
- `npm run sync:github` — read-only, idempotent upsert into `work_items`
- Open and recently closed PRs + labelled issues → WorkItem rows
- Raw GH metadata stored in `rawData` column
- Config: `GH_HOST`, `GH_TOKEN`, `GH_REPOS`

### Non-goals
- No write-back, no webhooks, no CI/CD data, no identity mapping

---

## Phase 2 — Jira Integration ✅

**Goal:** Pull delivery signals from Jira (epics, tickets, blockers).

### Scope
- `npm run sync:jira` — read-only, idempotent upsert into `work_items`
- Epics + tickets via `POST /rest/api/3/search/jql`, cursor pagination
- Jira issue key preserved as `externalId`; blocker links → `status: blocked`
- Raw Jira fields (including dates, assignee, statusCategory) stored in `rawData`
- Config: `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_PROJECTS`, `JIRA_INSECURE_TLS`

### Non-goals
- No write-back, no webhooks, no sprint velocity metrics

---

## Phase 3 — Work Triage ✅

**Goal:** Classify all synced work items into health categories using heuristics
on source-system dates, status, and assignment. Answer: *what is actually real?*

### Scope
- `lib/triage.ts` — pure classifier: `active`, `queued`, `blocked`, `stale`, `done`, `abandoned`
- Classification reads source-system dates from `rawData` (Jira `fields.created/updated`,
  GitHub `created_at/updated_at`) — not the sync timestamp
- Every item shows the specific signal that drove its classification (transparent, no silent scoring)
- No person-level grouping (DEC-002 hard constraint)
- Configurable thresholds exported as `TRIAGE_THRESHOLDS` constants
- `/triage` page: summary cards, area breakdown table, per-category sections with "View source ↗"

### Thresholds (defaults)
| Category | Rule |
|---|---|
| active | in_progress/in_review, updated ≤14 days |
| queued | not_started, created/updated ≤45 days |
| stale | in_progress, no update ≥60 days |
| abandoned | not_started, created ≥90 days, never updated |
| blocked-frozen | blocked, no update ≥30 days |

### Non-goals
- No LLM classification — heuristics only
- No writing back to Jira/GitHub

---

## Phase 4 — Weekly Progress View

**Goal:** "What moved last week?" — velocity signal without individual metrics.

### Scope
- `/progress` page showing a configurable look-back window (default 7 days)
- Items completed this week: `status === done` AND source-system `updated` within window
- Items unblocked: `status` changed from `blocked`, `updated` within window
- Items newly in-progress: `status === in_progress`, `updated` within window
- Grouped by area — never by person
- Summary: items completed, items unblocked, net change in backlog by area
- Trend line: compare this week vs last week if two syncs exist

### Key design constraint
Progress is derived entirely from source-system dates in `rawData`. No separate
history table needed in this phase — the current state + date window is sufficient.

### Non-goals
- No individual velocity tracking
- No sprint burndown charts
- No predictive estimates

### Acceptance Criteria
- Progress page renders with real data after a Jira/GitHub sync
- "Completed this week" correctly identifies items updated to `done` within the window
- Area grouping works correctly
- Empty state guides the user to run a sync

---

## Phase 5 — Focus Radar

**Goal:** "What should I focus on this week?" — prioritised attention list
combining triage category with risk level and area signals.

### Scope
- `/focus` page (or dashboard widget) showing the highest-attention items
- Priority order: blocked-frozen + high risk → blocked → stale + high risk → stale → abandoned (oldest)
- Each item shows: triage category, risk level, area, signal reason, days since last movement
- "This week only" filter: items that changed triage category since last sync
- Area heat map: which areas have the worst concentration of blocked/stale items
- Quick-link to source system per item

### Non-goals
- No automated recommendations — the EM decides, the radar informs
- No cross-engineer comparison

### Acceptance Criteria
- Focus page shows items ordered by attention priority
- Area heat map renders correctly
- Filtering by category works
- Each item links to its source

---

## Phase 6 — Decision Ledger CRUD

**Goal:** Build the decision-memory layer — now grounded in real data the EM
has already seen through triage and focus views.

### Why now?
The EM has opened Triage and Focus. They have seen that the same area keeps
producing blocked and stale items. They now have a reason to write a decision:
"we keep getting stuck here because we haven't agreed on X." The ledger is the
place to record that agreement.

### Scope
- Create / edit decision form
- Status management: `proposed → accepted → rejected → superseded → needs_review`
- Filter by area and status
- Review date field + review prompt when date has passed
- Markdown export for a single decision
- Manually link decisions to work items surfaced by triage

### Non-goals
- No automatic semantic search yet
- No Quorum integration yet (Phase 11)

### Acceptance Criteria
- User can create, edit, and change status of decisions
- Decisions can be filtered by area and status
- Decision can be exported as Markdown
- At least one decision can be linked to a real imported work item

---

## Phase 7 — Decision-Work Linkage

**Goal:** Connect the dots — which decisions explain the current state of work?

### Scope
- Tags and areas on decisions
- Keyword + area matching: work item title/area → relevant decisions
- "Why is this area always blocked?" → decisions that govern this area
- "Find relevant decisions" action on any work item
- User accept/dismiss flow for suggested links
- Explanation shown for each suggestion (area match, keyword match, tag)
- Triage page: surface governing decisions per area if any exist

### Non-goals
- No embeddings or semantic search yet (Phase 11)
- No autonomous linking without user approval

---

## Phase 8 — Weekly Report Generator

**Goal:** One Markdown report from real data — progress, triage state, decisions
cited — that an EM can share without editing.

### Scope
- `/reports` page with week selector
- Sections: Progress This Week, Current Triage State by Area, Blocked Items Needing Attention,
  Decisions Referenced This Week, Decisions Due for Review, Risks and Incidents Summary
- Every claim cites a source record (work item ID, decision ID, or incident)
- Facts vs interpretation separation (DEC-005)
- User can edit the interpretation section before export
- Markdown export

### Non-goals
- No automated AI interpretation yet
- No Quorum review yet (Phase 11)

---

## Phase 9 — Risk Register

**Goal:** Structured risk tracking connected to triage findings.

### Scope
- Risk create/edit form, list page
- Severity, likelihood, status, owner, mitigation, review date
- Link risks to work items surfaced by triage and to decisions
- Focus radar integration: open high-severity risks surface in the focus view
- Dashboard: open high risks, stale risk reviews

---

## Phase 10 — Incident Tracker

**Goal:** Lightweight incident logging with accountability for follow-ups.

### Scope
- Incident + follow-up tables, list/detail pages
- Severity, area, date, summary, contributing factors
- Follow-up actions with owner, status, due date
- Link incidents to decisions and risks
- Dashboard: overdue follow-ups

---

## Phase 11 — Quorum Integration

**Goal:** Make Quorum a first-class guidance layer for decisions and reviews.

### Scope
- Wire `lib/quorum/client.ts` singleton (fix LanceDB `vectordb` issue first)
- Review actions on decisions, work items, and weekly reports
- Oracle query → Jury evaluation → Council deliberation in-product
- Chronicle proposal after an accepted decision (human-gate enforced)
- Drift detection: does a Chronicle entry still match the current code?

### Prerequisite
LanceDB `vectordb` package `TypeError: failed to downcast any to string` must be
resolved before this phase. Workaround (direct JSON writes to `.chronicle/proposals/`)
is in place until then.

---

## Phase 12 — Confluence Integration

**Goal:** Pull context from Confluence — RFCs, architecture notes, meeting minutes —
to give Quorum and the Decision Ledger evidence to reason about.

### Scope
- `npm run sync:confluence`
- Page titles, labels, and URLs indexed as reference records (not full content)
- Config: `CONFLUENCE_HOST`, `CONFLUENCE_TOKEN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_SPACES`
- Browsable as reference links from decisions and work items

### Why deferred?
Confluence adds context for Quorum and the Decision Ledger. Until both are in
place (Phases 6 and 11), Confluence pages have nowhere to land. `lib/env.ts`
already declares the required variables.

---

## Phase 13 — Importers

**Goal:** Reduce data entry friction for decisions, risks, and incidents.

### Scope
- GitHub PR → Decision importer (parse PR description for decision shape)
- ADR Markdown file importer
- Linear / Jira CSV importer for work items with history
- Incident Markdown importer
- All importers follow the parse → preview → user-confirm → save pipeline (no auto-save)

---

## Phase 14 — Polish and Trust

**Goal:** Trustworthy, onboardable, exportable at scale.

### Scope
- Improved empty states and onboarding flow
- Full-text search across decisions, work items, risks, incidents
- Data backup and JSON export
- Audit trail for decision status changes
- Sample Atlas dataset demonstrating full EM workflow end-to-end

---

## Integration Reference

| Source | Command | Config |
|---|---|---|
| GitHub | `npm run sync:github` | `GH_HOST`, `GH_TOKEN`, `GH_REPOS` |
| Jira | `npm run sync:jira` | `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_PROJECTS` |
| Confluence | `npm run sync:confluence` *(Phase 12)* | `CONFLUENCE_HOST`, `CONFLUENCE_TOKEN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_SPACES` |


This document records the agreed build order and rationale. It supplements
`DecisionDeck.md` and takes precedence over the original phase list there.

---

## Guiding Principle

**Source real data before building judgment layers.**

The Decision Ledger and Quorum integration only have value when they can reason
about *actual* signals — real PRs, real tickets, real blockers. Manual seed data
is useful for testing forms; it does not produce a tool an EM will open on Monday
morning. Therefore: integrate data sources early, build the knowledge layer on top.

---

## Phase 0 — Project Foundation

**Goal:** Running app shell with database, navigation, and seed decisions.

### Scope
- Initialize Next.js + TypeScript app (App Router)
- Add SQLite + Drizzle ORM (`db/schema.ts`, migrations)
- App shell layout with navigation: Dashboard, Decisions, Work, Risks, Incidents, Reports
- Vitest setup with a passing smoke test
- Seed script (`db/seed.ts`) with the 11 initial DEC decisions (see below)
- `lib/env.ts` for environment variable validation (Zod)

### Why seed decisions before integrations?
The DEC-001…DEC-011 entries are *project configuration*, not demo data. They need
to exist before the first GitHub PR is imported so the matcher has something to
fire against from day one.

### Seed decisions
```
DEC-001: DecisionDeck is local-first
DEC-002: DecisionDeck must not rank individual engineers
DEC-003: Every metric needs interpretation notes
DEC-004: Risky work should link to relevant decisions
DEC-005: Weekly reports distinguish facts from interpretation
DEC-006: Human approval is required before committing durable decisions
DEC-007: Auth changes require rollback plans
DEC-008: Billing events must be idempotent
DEC-009: Audit logs are append-only
DEC-010: Production permission changes require two reviewers
DEC-011: Deployment rollback must be tested before release
```

### Non-goals
- No external integrations
- No authentication
- No advanced analytics

### Acceptance Criteria
- App runs locally (`npm run dev`)
- SQLite database can be created and seeded (`npm run db:seed`)
- Navigation renders for all six sections
- Vitest passes at least one test
- All 11 seed decisions visible

---

## Phase 1 — GitHub Integration Layer

**Goal:** Pull real engineering signals from GitHub Enterprise via the GH CLI.

### Why first?
PRs and issues are where engineering work actually lives. Importing them early
means every subsequent phase is built against real data. The GH CLI (`gh`) is
local tooling and does not violate the local-first principle. GitHub Enterprise
only requires `GH_HOST` to be set.

### Scope
- Read-only sync command: `npm run sync:github`
- Pull open and recently closed PRs from configured repos
- Pull open issues labelled as work items
- Map PRs/issues → `WorkItem` rows in SQLite (idempotent upsert)
- Store raw GH metadata as a JSON column for later enrichment
- Basic "Last synced" indicator in the UI
- Config via `.env.local`: `GH_HOST`, `GH_TOKEN`, `GH_REPOS` (comma-separated)
- Zod validation of all GH API responses before writing to DB

### GH CLI vs direct API
Prefer `gh api` for structured JSON output. Use `GH_HOST` for Enterprise.
Do not shell out to `gh` from Next.js API routes — run sync as a standalone
Node.js script to keep the web server stateless.

### Non-goals
- No write-back to GitHub
- No webhook listeners
- No CI/CD pipeline data yet
- No user/team identity mapping yet

### Acceptance Criteria
- `npm run sync:github` runs without errors against a real repo
- PRs and issues appear as work items in the DB
- Re-running sync does not create duplicates
- Source field on each work item records `github`
- Sync respects rate limits and fails gracefully

---

## Phase 2 — Jira Integration Layer

**Goal:** Pull delivery signals from Jira (epics, tickets, blockers) into the
unified work item model.

### Why before the Decision Ledger?
Jira is where the official delivery backlog lives for most enterprise teams.
Epics map naturally to areas; blocked tickets surface operational risk. Having
this data means the Decision Ledger entries in Phase 5 can immediately link to
real epics, not hypothetical ones.

### Scope
- Read-only sync command: `npm run sync:jira`
- Pull epics and tickets from configured Jira project(s) via Jira REST API
- Map epics/tickets → `WorkItem` rows (idempotent upsert, source = `jira`)
- Store Jira issue key (`PROJ-123`) as external ID for deduplication
- Pull blocker links between issues
- Config via `.env.local`: `JIRA_HOST`, `JIRA_TOKEN`, `JIRA_PROJECTS`
- Zod validation of all Jira API responses

### Non-goals
- No write-back to Jira
- No Jira webhooks
- No sprint velocity metrics

### Acceptance Criteria
- `npm run sync:jira` imports epics and tickets from at least one project
- Blocked tickets are flagged in the work item model
- Jira issue keys are preserved as external IDs
- Re-running sync is idempotent

---

## Phase 3 — Confluence Integration Layer

**Goal:** Pull context from Confluence — pages, RFC documents, meeting notes —
to give the Decision Ledger raw material to reason about.

### Why?
Many engineering decisions live in Confluence as RFCs, architecture notes, or
meeting minutes. Surfacing these gives Quorum evidence to cite and gives the EM
context when reviewing decisions.

### Scope
- Read-only sync command: `npm run sync:confluence`
- Pull pages from configured Confluence spaces
- Index page titles, summaries, and URLs
- Store as `ConfluencePage` reference records (not full content — links only,
  unless content is short)
- Tag pages by space and label
- Config via `.env.local`: `CONFLUENCE_HOST`, `CONFLUENCE_TOKEN`, `CONFLUENCE_SPACES`
- Zod validation of all Confluence API responses

### Non-goals
- No write-back to Confluence
- No full-text indexing in this phase (that's Quorum's job later)
- No creating or editing pages

### Acceptance Criteria
- `npm run sync:confluence` indexes pages from at least one space
- Pages are browsable as reference links (title + URL)
- Labels and spaces are preserved for filtering
- Re-running sync is idempotent

---

## Phase 4 — Metrics Dashboard

**Goal:** First user value — "What needs my attention this week?" — backed by
real GitHub and Jira data.

### Why before the Decision Ledger?
This is the first thing an EM will find useful. It answers the immediate
question without requiring any manual data entry. Once the EM sees real blocked
PRs and stale tickets on their dashboard, they are motivated to attach decisions
to them in Phase 5.

### Scope
- Dashboard landing page
- Cards sourced from real imported data:
  - Blocked work items (from Jira blocker links + GH draft/review-blocked PRs)
  - PRs open longer than N days (configurable)
  - High-risk work items (manual flag, or heuristic from PR age + no reviews)
  - Work items with no linked decision (becomes a prompt to use the ledger)
  - Open risks (manual at this stage)
  - Decisions due for review (from seed data review dates)
- Each card links to the source record
- Configurable thresholds in `.env.local` (e.g. `PR_AGE_WARNING_DAYS=7`)

### Non-goals
- No individual-engineer metrics (DEC-002)
- No commit-count or lines-of-code displays
- No automated recommendations yet (that's Quorum, Phase 10)

### Acceptance Criteria
- Dashboard renders with real imported data
- Blocked work and aging PRs surface correctly
- Each card links to the work item detail
- Empty states explain how to get data (run sync)

---

## Phase 5 — Decision Ledger

**Goal:** Build the core decision-memory feature — now grounded in real data.

### Why now?
The EM has seen real blocked PRs, real epics, real Confluence pages. They know
what operational patterns exist. They can now write decisions that mean
something — "Auth changes require rollback plans" fires against actual auth PRs
they just reviewed.

### Scope
- Decision table (if not already from Phase 0)
- Decision list and detail pages
- Create/edit decision form
- Status management: `proposed → accepted → rejected → superseded → needs_review`
- Filter by area and status
- Review date field
- Markdown export for a single decision
- Manually link decisions to work items from GitHub/Jira

### Non-goals
- No automatic semantic search yet
- No complex approval workflow
- No Quorum integration yet (that's Phase 10)

### Acceptance Criteria
- User can create and edit decisions
- User can change decision status
- User can filter decisions
- User can export a decision as Markdown
- Seed decisions are visible and editable
- At least one decision can be linked to a real imported work item

---

## Phase 6 — Decision Linking

**Goal:** "Find relevant decisions" — match imported work items to decisions.

### Scope
- Tags/topics on decisions
- Keyword matching across title, context, decision, rationale, and risks
- Area matching between work items and decisions
- "Find relevant decisions" action on work items
- User accept/dismiss flow for suggested links
- Explanation shown for each suggestion (area match, keyword match, tag match)

### Non-goals
- No embeddings or semantic search yet
- No autonomous linking without user approval

### Acceptance Criteria
- "Find relevant decisions" returns results for a real imported GitHub PR
- Suggestions are explainable
- User can accept or dismiss each suggestion
- Accepted links are persisted

---

## Phase 7 — Risk Register

**Goal:** Structured risk tracking linked to real work and decisions.

### Scope
- Risk table, list page, create/edit form
- Severity, likelihood, status, owner, mitigation, review date
- Link risks to work items and decisions
- Dashboard cards: open high risks, stale risk reviews

---

## Phase 8 — Incident Follow-up Tracker

**Goal:** Lightweight incident logging with accountability for follow-ups.

### Scope
- Incident + follow-up tables, list/detail pages
- Severity, area, date, summary, impact, contributing factors
- Follow-up actions with owner, status, due date
- Link incidents to decisions and risks
- Dashboard: overdue follow-ups

---

## Phase 9 — Weekly Report Generator

**Goal:** Markdown report from real data, facts separated from interpretation.

### Scope
- Report generation page for a selected week
- Sections: Needs Attention, Blocked Work, High-Risk Work, Open Risks,
  Incidents and Follow-ups, Decisions Accepted, Decisions Needing Review,
  Recommended Actions, Appendix: Linked Decisions
- Each recommendation must cite a source record or decision
- User can edit report before export
- Save generated reports locally
- Markdown export

---

## Phase 10 — Decision Review Queue

**Goal:** Surface stale, risky, or contradicted decisions automatically.

### Scope
- Rule-based review triggers:
  - Review date passed
  - No owner
  - Linked to high-risk active work
  - Linked to open incidents
  - Superseded decision still referenced
  - Rejected idea has a similar new proposal
- Actions: mark reviewed, move to `needs_review`, create superseding decision

---

## Phase 11 — Quorum-Backed Review Actions

**Goal:** Make Quorum a first-class guidance layer.

### Scope
- Wire `lib/quorum/client.ts` singleton
- Review actions on decisions, work items, and weekly reports
- Retrieve evidence + display recommendation + gaps in UI
- Chronicle proposal after an accepted decision (human-gate required)

---

## Phase 12 — Polish and Trust

**Goal:** Trustworthy, onboardable, exportable.

### Scope
- Better dashboard layout, empty states, onboarding
- Search across decisions, work items, risks, and incidents
- Data backup/export
- Audit trail for decision status changes
- More tests
- Sample Atlas dataset demonstrating full workflow

---

## Integration Reference

| Source | Command | Config keys |
|---|---|---|
| GitHub Enterprise | `npm run sync:github` | `GH_HOST`, `GH_TOKEN`, `GH_REPOS` |
| Jira | `npm run sync:jira` | `JIRA_HOST`, `JIRA_TOKEN`, `JIRA_PROJECTS` |
| Confluence | `npm run sync:confluence` | `CONFLUENCE_HOST`, `CONFLUENCE_TOKEN`, `CONFLUENCE_SPACES` |

All sync commands are standalone Node.js scripts. They do not run inside the
Next.js server. They write to the local SQLite DB. Re-running is always safe
(idempotent upsert).

---

## Anti-features (do not build without an explicit decision reversing this)

- Individual engineer productivity scores
- Commit-count or lines-of-code metrics
- PR-count leaderboards
- Automated performance-review summaries
- Recommendations that do not cite evidence
- Automatic decision acceptance without human approval
- Cloud sync as an MVP requirement
