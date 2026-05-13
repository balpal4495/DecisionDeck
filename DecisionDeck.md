# DecisionDeck

A local-first engineering manager flight deck — delivery intelligence with decision memory.

DecisionDeck helps an engineering manager answer three recurring questions:

1. **What actually moved last week?** — progress signal from real work, not what was planned
2. **What is actually happening right now?** — triage across all work: signal vs noise, blocked vs moving
3. **What should we focus on this week, and does that track long-term?** — prioritisation grounded in backlog health and decision context

It combines a delivery intelligence layer (what is real, what is stuck, what is noise) with a durable decision ledger (why the team works the way it does). The goal is not to create another metrics dashboard or a governance tool that requires manual data entry to be useful. The goal is to make sense of the present-day chaos — real work across real systems — and connect it to the decisions and principles that explain how the team wants to operate.

---

## Product Summary

**DecisionDeck is a local-first EM delivery intelligence tool. It classifies the present-day chaos — real work items from GitHub and Jira — into signal vs noise, surfaces what moved and what is stuck, and connects the current state of delivery to the prior decisions that explain why the team operates the way it does.**

The first useful version answers the Monday-morning question without requiring manual data entry: sync your Jira project and GitHub repos, and DecisionDeck tells you what is active, what is blocked, what is stale, and what is probably abandoned.

Decisions, risks, and incidents layer on top as institutional memory — they explain the patterns triage surfaces.

---

## Core Product Principles

### 1. Make sense of the present first

Before governance, before reports, before decisions — understand what is actually happening. 387 work items are not useful until you know which 40 are real signal. Triage comes before linking.

### 2. Integrate data sources before building judgment layers

Decision governance only has value when it can reason about actual signals — real PRs, real tickets, real blockers. Manual seed data is useful for testing; it does not produce a tool an EM will open on Monday morning.

### 3. Help managers improve systems, not score individuals

This principle is a hard constraint on product, data model, reporting, and UI choices.

DecisionDeck must never:
- Surface individual productivity rankings
- Show commit-count or PR-count dashboards by person
- Make automated judgments about individual performance
- Group work items by assignee in any context that implies personal metrics

DecisionDeck should:
- Surface team-level flow health by area
- Show blockers and stale work at the ticket level, not the person level
- Explain classifications transparently (the reason is always shown)
- Give the EM information to have better conversations, not verdicts

### 4. Classification is a hypothesis

Every triage result, every automated signal, every report is a candidate for EM review — not ground truth. The EM is always one click from the source system. The tool assists; the EM decides.

---

## Target User

Primary user:

- Engineering manager of a small to medium engineering team

Secondary users:

- Tech lead
- Staff engineer
- Engineering director reviewing team-level risk
- Founder acting as EM

The primary user should be able to run this locally without needing organization-wide setup.

---

## Weekly Operating Rhythm

DecisionDeck is built around the EM's actual week, not a theoretical governance model.

### Monday morning
1. Open **Triage** — see the health breakdown by area. How much is active signal, how much is probable noise?
2. Open **Focus** — what's blocked, what's frozen, what's high-risk and stale? These are the conversations to have this week.
3. Check **Decisions due for review** — anything that a current triage finding connects to.

### End of week (Friday)
4. Open **Progress** — what moved from in-progress → done, blocked → unblocked this week? This is your velocity signal.
5. Generate a **Weekly Report** — progress + triage state + decisions cited, exported as Markdown.
6. Optional: use Quorum to check whether any recommendation is backed by prior decisions or contradicts them.

### Ongoing
7. Write decisions when triage surfaces a pattern that needs a governing principle.
8. Link decisions to the work items and risks they explain.
9. Let the review queue surface decisions that the current state of work has made stale.

---

## Core Objects

The first version should keep the domain model intentionally small.

### Decision

A durable engineering or operating decision.

Examples:

- Auth changes require rollback plans.
- Audit logs are append-only.
- Do not rank individual engineers.
- Weekly reports must distinguish facts from interpretation.
- Production permission changes require two reviewers.

Suggested fields:

```ts
type Decision = {
  id: string;
  title: string;
  status: "proposed" | "accepted" | "rejected" | "superseded" | "needs_review";
  area: string;
  owner?: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives?: string;
  risks?: string;
  reviewDate?: string;
  supersedesDecisionIds: string[];
  supersededByDecisionId?: string;
  linkedWorkItemIds: string[];
  linkedRiskIds: string[];
  linkedIncidentIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

### Work Item

An active piece of engineering work that may need attention.

Examples:

- Refactor login session handling.
- Add billing webhook retry dashboard.
- Migrate audit logs to partitioned table.
- Replace legacy admin permissions model.

Suggested fields:

```ts
type WorkItem = {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "in_review" | "done";
  area: string;
  owner?: string;
  riskLevel: "low" | "medium" | "high";
  blockedReason?: string;
  targetDate?: string;
  notes?: string;
  linkedDecisionIds: string[];
  linkedRiskIds: string[];
  linkedIncidentIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

### Risk

A delivery, reliability, ownership, process, or architectural risk.

Examples:

- Only one engineer understands billing retries.
- Auth refactor has unclear rollback path.
- Audit table is growing too quickly.
- Deploy checklist is not consistently followed.

Suggested fields:

```ts
type Risk = {
  id: string;
  title: string;
  area: string;
  severity: "low" | "medium" | "high";
  likelihood: "low" | "medium" | "high";
  status: "open" | "mitigating" | "accepted" | "closed";
  owner?: string;
  mitigation?: string;
  lastReviewedAt?: string;
  nextReviewDate?: string;
  linkedDecisionIds: string[];
  linkedWorkItemIds: string[];
  linkedIncidentIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

### Incident

An incident or notable operational event with follow-ups.

Suggested fields:

```ts
type Incident = {
  id: string;
  title: string;
  severity: "sev1" | "sev2" | "sev3" | "sev4";
  area: string;
  date: string;
  summary: string;
  impact?: string;
  contributingFactors?: string;
  followUps: IncidentFollowUp[];
  linkedDecisionIds: string[];
  linkedWorkItemIds: string[];
  linkedRiskIds: string[];
  createdAt: string;
  updatedAt: string;
};

type IncidentFollowUp = {
  id: string;
  title: string;
  owner?: string;
  status: "open" | "in_progress" | "done" | "dropped";
  dueDate?: string;
  evidence?: string;
};
```

### Weekly Report

A generated Markdown snapshot for the EM.

Suggested fields:

```ts
type WeeklyReport = {
  id: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  highlights: string;
  risks: string;
  blockedWork: string;
  decisions: string;
  incidents: string;
  followUps: string;
  generatedMarkdown: string;
};
```

---

## Core Modules

### 1. This Week Dashboard

The main landing page.

It should surface:

- Blocked work
- High-risk work
- Work in review
- Overdue follow-ups
- Open risks
- Decisions due for review
- Recently accepted decisions
- Incidents with unresolved actions

Each dashboard card should be able to link to relevant decisions.

Example:

```txt
Risk:
Auth refactor PR has been open for 8 days.

Relevant decisions:
- DEC-004: Auth changes require rollback plan.
- DEC-011: Session invalidation is server-side.
- DEC-017: Auth module requires security reviewer.
```

### 2. Decision Ledger

A searchable database of decisions.

Required capabilities:

- Create a decision
- Edit a decision
- Accept or reject a decision
- Mark a decision as superseded
- Mark a decision as needing review
- Filter decisions by area, owner, and status
- Export decisions to Markdown
- Link decisions to work, risks, and incidents

### 3. Work Radar

A lightweight tracker for active engineering work.

Required capabilities:

- Create work items
- Track status
- Mark work as blocked
- Assign area and risk level
- Link work to relevant decisions
- Show blocked, aging, or high-risk work

### 4. Risk Register

A place to track risks without turning everything into a project plan.

Required capabilities:

- Create a risk
- Assign severity and likelihood
- Track mitigation
- Link risks to decisions and work
- Review risk status weekly
- Distinguish accepted risks from unresolved risks

### 5. Incident Follow-up Tracker

A lightweight incident and action-item tracker.

Required capabilities:

- Record incident summary
- Capture severity, area, and date
- Track follow-up actions
- Link incidents to decisions and risks
- Show overdue follow-ups on the dashboard

### 6. Weekly Report Generator

A Markdown report generator.

The report should include:

- Needs attention
- Blocked work
- High-risk work
- Open risks
- Incident follow-ups
- Decisions accepted this week
- Decisions needing review
- Recommended EM actions

Important rule: recommendations should cite source records or linked decisions.

Example output:

```md
# Engineering Weekly Report

## Needs Attention

- Auth refactor is high-risk and has no linked rollback evidence.
  - Relevant decision: DEC-004, Auth changes require rollback plan.

## Blocked Work

- Billing webhook retry dashboard is blocked on ownership clarification.

## Decisions

- DEC-018 accepted: Use feature flags for risky migrations.
- DEC-003 needs review: REST vs GraphQL for public API.

## Follow-ups

- INC-012 has two overdue remediation items.
```

### 7. Decision Review Queue

A queue of decisions that may need revalidation.

A decision should appear in the review queue when:

- Its review date has passed
- It has no owner
- It is linked to multiple open risks
- It is contradicted by current work
- It is old and belongs to a high-change area
- It has been referenced repeatedly by new proposals
- It was rejected before but keeps reappearing

---

## Key Feature: Find Relevant Decisions

For any work item, risk, incident, or proposed decision, the user should be able to click:

```txt
Find relevant decisions
```

The app should return decisions that may apply.

Initial implementation can be simple:

- Match by area
- Match by title keywords
- Match by tags or topics
- Match by manually linked records

Later implementation can use Quorum Oracle retrieval.

Example:

```txt
Work item:
Refactor login session handling.

Relevant decisions:
1. DEC-004: Auth changes require rollback plan.
2. DEC-011: Session invalidation is server-side.
3. DEC-017: Auth requires security reviewer.

Potential gaps:
- No rollback plan linked.
- No test evidence linked.
- No security reviewer assigned.
```

---

## Quorum Integration Guidance

DecisionDeck should use Quorum as a judgment and memory layer, not as a hidden autonomous decision-maker.

Quorum should help with:

1. Retrieving prior decisions
2. Reviewing proposed decisions
3. Challenging risky recommendations
4. Preventing repeated rejected ideas
5. Generating Chronicle proposals after important decisions
6. Checking whether weekly reports are supported by evidence

### Suggested Quorum Use Points

#### Before accepting a decision

Prompt shape:

```txt
Review this proposed decision against prior Chronicle entries.
Identify conflicts, missing evidence, superseded decisions, and risks.
Return a recommendation: accept, reject, revise, or needs more evidence.
```

#### When linking work to decisions

Prompt shape:

```txt
Given this work item, find relevant prior decisions.
Explain why each decision applies.
Identify any missing evidence, rollback plans, tests, owners, or review requirements.
```

#### Before generating weekly recommendations

Prompt shape:

```txt
Given these risks, blocked work, incidents, and decisions, generate weekly EM recommendations.
Each recommendation must cite evidence.
Do not infer individual performance.
Distinguish facts from interpretation.
```

#### When reviewing stale decisions

Prompt shape:

```txt
This decision is due for review.
Based on recent work, risks, incidents, and linked decisions, should it remain accepted, be revised, or be superseded?
Identify evidence for and against keeping it.
```

---

## Initial Chronicle Decisions

Seed these early as project-level decisions.

### DEC-001: DecisionDeck is local-first

DecisionDeck should store data locally by default. External integrations are optional and should not be required for the MVP.

Rationale: EM data can be sensitive. Local-first storage allows safe experimentation and avoids premature integration complexity.

### DEC-002: DecisionDeck must not rank individual engineers

DecisionDeck should not include individual productivity rankings, leaderboards, or scorecards.

Rationale: The product exists to improve team systems and decision quality, not evaluate individuals using weak signals.

### DEC-003: Every metric needs interpretation notes

Any metric shown in the product must include context about what it does and does not mean.

Rationale: Metrics without interpretation are easy to misuse.

### DEC-004: Risky work should link to relevant decisions

High-risk work items should link to accepted decisions that constrain or guide the work.

Rationale: This helps prevent the team from repeating past debates or violating accepted operating rules.

### DEC-005: Weekly reports distinguish facts from interpretation

Generated reports should separate observed facts from recommendations, concerns, or interpretations.

Rationale: EM reports are more trustworthy when evidence and judgment are clearly separated.

### DEC-006: Human approval is required before committing durable decisions

Quorum can propose Chronicle entries, but a human should approve durable decisions before they become accepted project memory.

Rationale: The decision ledger should be trusted and curated.

---

## Suggested Tech Stack

Recommended local-first stack:

```txt
Next.js
TypeScript
SQLite
Drizzle ORM or Prisma
CSS Modules (Next.js built-in — no Tailwind, no PostCSS config)
Vitest
Markdown export
Quorum integration under lib/quorum
```

Recommended repository structure:

```txt
decisiondeck/
  app/
    dashboard/
    decisions/
    work/
    risks/
    incidents/
    reports/
    api/
  components/
  db/
    schema.ts
    migrations/
    seed.ts
  lib/
    decision-matching.ts
    report-generator.ts
    env.ts
    quorum/
      client.ts
      prompts.ts
      review-decision.ts
      review-report.ts
  .github/
    copilot-instructions.md
    agents/
      Orchestrator.agent.md     ← entry point — routes work, enforces Quorum gate
      FeatureBuilder.agent.md   ← pages, components, business logic, Markdown export
      IntegrationEngineer.agent.md ← API routes, lib/quorum/ wiring, importers, Zod
      DataEngineer.agent.md     ← schema, migrations, seed data, Chronicle proposals
      Architect.agent.md        ← Quorum review gate, phase scoping, design decisions
    skills/
      nextjs-app-router/SKILL.md      ← App Router pages, Server vs Client rules
      css-modules-pattern/SKILL.md    ← CSS Modules, design tokens, no Tailwind
      vitest-testing/SKILL.md         ← unit + integration test patterns
      markdown-export/SKILL.md        ← Markdown shapes for decisions and reports
      report-generator/SKILL.md       ← weekly report assembly, fact-vs-interpretation
      quorum-client/SKILL.md          ← oracle/jury/council call shapes, setup() wiring
      nextjs-api-routes/SKILL.md      ← route handler conventions, Zod, error shapes
      importer-pattern/SKILL.md       ← parse → preview → confirm → save pipeline
      zod-validation/SKILL.md         ← Zod at all API and LLM output boundaries
      drizzle-schema/SKILL.md         ← Drizzle ORM for SQLite, migrations, types
      chronicle-propose/SKILL.md      ← oracle.propose() field requirements, human gate
      seed-data/SKILL.md              ← idempotent seed, all DEC entries, Atlas data
      quorum-review/SKILL.md          ← full Oracle → Jury → Council → propose pipeline
      decision-matching/SKILL.md      ← area → keyword → tag match priority
      phase-scoping/SKILL.md          ← phase boundaries and non-goals for all phases
  tests/
  docs/
    DecisionDeck.md
  .chronicle/
    proposals/
    committed/
```

---

## Build Phases

The project should be built in phases. Each phase should result in a locally useful product, not just infrastructure.

---

# Phase 0: Project Foundation

Goal: Create the repo, app shell, database foundation, and guiding decisions.

## Scope

- Initialize Next.js and TypeScript app
- Add SQLite and ORM
- Add basic app layout
- Add navigation shell
- Add test setup
- Add seed data script
- Add this `DecisionDeck.md` file under `docs/` or the repository root
- Initialize Quorum and Chronicle if available
- Seed the initial Chronicle decisions listed above

## Non-goals

- No external integrations
- No advanced analytics
- No authentication yet unless needed for local use
- No multi-user support

## Acceptance Criteria

- App runs locally
- SQLite database can be created and seeded
- Navigation exists for Dashboard, Decisions, Work, Risks, Incidents, and Reports
- At least five seed decisions exist
- Tests can run locally
- Product principles are documented in the repo

## Suggested Quorum Check

Ask Quorum:

```txt
Review the initial DecisionDeck project principles.
Identify any risks in the product direction and propose Chronicle entries that should constrain future development.
```

---

# Phase 1: Decision Ledger

Goal: Build the core decision-memory feature first.

## Scope

- Create decision database table
- Add decision list page
- Add decision detail page
- Add create/edit decision form
- Support statuses:
  - proposed
  - accepted
  - rejected
  - superseded
  - needs_review
- Filter by area and status
- Add review date field
- Add Markdown export for a single decision

## Non-goals

- No automatic semantic search yet
- No complex approval workflow
- No integrations

## Acceptance Criteria

- User can create a decision
- User can edit a decision
- User can change decision status
- User can filter decisions
- User can export a decision as Markdown
- Seed decisions are visible and editable

## Suggested Quorum Check

Ask Quorum:

```txt
Review the Decision Ledger model.
Does it capture enough information to explain why a decision was made, what alternatives were rejected, and when it should be reviewed?
```

## Example Test Scenario

Create a proposed decision:

```txt
Title: Add individual PR count metric
Decision: Show PR counts per engineer on the dashboard
```

Expected result:

- Quorum should retrieve DEC-002
- The proposal should be challenged or rejected
- A safer alternative should be suggested, such as team-level review load or stale PR count

---

# Phase 2: Work Radar

Goal: Add active work tracking and link work to decisions.

## Scope

- Create work item database table
- Add work list page
- Add create/edit work item form
- Track status, area, owner, risk level, blocked reason, and target date
- Manually link decisions to work items
- Add dashboard cards for:
  - blocked work
  - high-risk work
  - work in review
  - work missing linked decisions

## Non-goals

- No GitHub import yet
- No automatic owner inference
- No performance analytics

## Acceptance Criteria

- User can create and edit work items
- User can mark work as blocked
- User can mark work as high-risk
- User can link one or more decisions to a work item
- Dashboard shows blocked and high-risk work

## Suggested Quorum Check

Ask Quorum:

```txt
Given this work item, find relevant prior decisions and identify gaps.
```

## Example Test Scenario

Work item:

```txt
Title: Refactor login session handling
Area: auth
Risk: high
Linked decisions: none
```

Expected result:

- App should flag that high-risk work has no linked decisions
- Quorum should suggest relevant auth/session decisions if they exist
- Quorum should ask for rollback/test/security-review evidence if appropriate

---

# Phase 3: Decision Linking

Goal: Implement the first version of "Find relevant decisions."

## Scope

- Add tags or topics to decisions
- Add simple matching by area
- Add keyword matching across title, context, decision, rationale, and risks
- Add a "Find relevant decisions" action on work items
- Allow user to accept or dismiss suggested links
- Store accepted links

## Non-goals

- No embeddings required yet
- No full-text search required yet unless easy
- No autonomous linking without user approval

## Acceptance Criteria

- User can click "Find relevant decisions" from a work item
- App returns likely related decisions
- User can link suggested decisions
- User can dismiss irrelevant suggestions
- Suggestions are explainable using area, keyword, or tag match

## Suggested Quorum Check

Ask Quorum:

```txt
Review the matching behavior.
Are suggestions explainable and conservative enough for a management decision-support tool?
```

## Example Test Scenario

Decision:

```txt
Title: Auth changes require rollback plan
Area: auth
Tags: auth, rollback, security
```

Work item:

```txt
Title: Refactor login session handling
Area: auth
Risk: high
```

Expected result:

- The decision is suggested
- The explanation includes area and keyword overlap
- The user can accept the link

---

# Phase 4: Risk Register

Goal: Add risk tracking and connect risks to work and decisions.

## Scope

- Create risk database table
- Add risk list page
- Add create/edit risk form
- Track severity, likelihood, status, owner, mitigation, and review date
- Link risks to work items
- Link risks to decisions
- Add dashboard cards for open high risks and stale risk reviews

## Non-goals

- No quantitative risk scoring yet
- No automated severity calculation
- No executive reporting export yet

## Acceptance Criteria

- User can create and edit risks
- User can link risks to work and decisions
- Dashboard shows open high risks
- Risks can be marked accepted, mitigating, closed, or open
- Risk review dates appear on the dashboard when stale

## Suggested Quorum Check

Ask Quorum:

```txt
Should this risk be closed, accepted, or kept open?
Identify what evidence is required before changing the status.
```

## Example Test Scenario

Risk:

```txt
Title: Only one engineer understands billing webhook retries
Area: billing
Severity: high
Likelihood: medium
Status: open
```

Expected result:

- Risk appears on dashboard
- Risk can link to billing decisions
- Weekly report includes it under Needs Attention or Open Risks

---

# Phase 5: Incident Follow-up Tracker

Goal: Add lightweight incident tracking and follow-up accountability.

## Scope

- Create incident database table
- Create incident follow-up table or JSON field
- Add incident list page
- Add create/edit incident form
- Track severity, area, date, summary, impact, contributing factors, and follow-ups
- Link incidents to decisions, work, and risks
- Show overdue follow-ups on the dashboard

## Non-goals

- No incident timeline builder yet
- No paging or alerting integrations
- No postmortem template complexity unless easy

## Acceptance Criteria

- User can create an incident
- User can add follow-up actions
- User can mark follow-ups done or dropped
- Overdue follow-ups appear on dashboard
- Incidents can link to decisions and risks

## Suggested Quorum Check

Ask Quorum:

```txt
Review this incident and follow-up list.
Do the follow-ups address the contributing factors?
Are any accepted decisions contradicted by what happened?
```

## Example Test Scenario

Incident:

```txt
Title: Production deploy required manual rollback
Area: deployments
Severity: sev2
Follow-up: Update rollback checklist
```

Expected result:

- Incident appears in incident list
- Follow-up appears on dashboard if overdue
- Incident can link to a deployment rollback decision

---

# Phase 6: Weekly Report Generator

Goal: Generate useful Markdown reports from local data.

## Scope

- Add report generation page
- Generate report for a selected week
- Include blocked work, high-risk work, open risks, incidents, follow-ups, and decisions
- Include relevant decision links in report sections
- Separate facts from interpretation
- Allow user to edit generated report before export
- Save generated reports locally
- Export report to Markdown

## Non-goals

- No automatic Slack/Email/Notion posting
- No executive-specific formatting yet
- No generative recommendations unless cited

## Acceptance Criteria

- User can generate a weekly report
- Report includes key operational sections
- Report cites linked decisions where available
- Report distinguishes facts from interpretation
- User can export Markdown

## Suggested Quorum Check

Ask Quorum:

```txt
Review this weekly report.
Identify unsupported claims, missing decision links, risky interpretations, or individual-performance inferences.
```

## Example Report Structure

```md
# Engineering Weekly Report

## Summary

## Needs Attention

## Blocked Work

## High-Risk Work

## Open Risks

## Incidents and Follow-ups

## Decisions Accepted This Week

## Decisions Needing Review

## Recommended Actions

## Appendix: Linked Decisions
```

---

# Phase 7: Decision Review Queue

Goal: Surface stale, risky, or contradicted decisions.

## Scope

- Add decision review queue page
- Add rule-based review triggers:
  - review date passed
  - no owner
  - linked to high-risk active work
  - linked to open incidents
  - superseded decision still referenced
  - rejected idea has similar new proposal
- Add action to mark decision as reviewed
- Add action to move decision to needs_review
- Add action to create a superseding proposed decision

## Non-goals

- No automatic decision status changes
- No hidden background jobs required
- No complex contradiction detection yet

## Acceptance Criteria

- Decisions due for review appear in queue
- User can mark decisions reviewed
- User can create a superseding decision
- Dashboard shows count of decisions needing review
- Quorum can be used to evaluate whether a decision should remain accepted

## Suggested Quorum Check

Ask Quorum:

```txt
This decision is due for review.
Given linked work, risks, incidents, and newer decisions, should it remain accepted, be revised, or be superseded?
```

---

# Phase 8: Quorum-Backed Review Actions

Goal: Make Quorum a first-class guidance layer in the app.

## Scope

Add review actions such as:

- Review proposed decision
- Find related decisions
- Review work item risk
- Review weekly report
- Review stale decision
- Propose Chronicle entry after accepted decision

Each action should show:

- Retrieved evidence
- Relevant decisions
- Confidence or recommendation
- Risks and gaps
- Suggested next action

## Non-goals

- No autonomous approval
- No automatic durable memory writes without human approval
- No hidden model actions

## Acceptance Criteria

- User can run Quorum review from a proposed decision
- User can run Quorum review from a work item
- User can run Quorum review from a report
- Quorum output is saved or attached to the record
- User can accept, ignore, or revise based on review
- Accepted decisions can generate Chronicle proposals

## Suggested Quorum Check

Ask Quorum to review the Quorum integration itself:

```txt
Does this integration preserve human approval over durable decisions?
Does it cite evidence clearly?
Does it avoid unsupported management recommendations?
```

---

# Phase 9: Optional Importers

Goal: Add integrations only after the local workflow is useful.

Possible importers:

- GitHub PR import
- Linear CSV import
- Jira CSV import
- Incident Markdown import
- ADR Markdown import
- Calendar export import

Recommended order:

1. ADR Markdown import
2. GitHub PR import
3. Linear or Jira CSV import
4. Incident Markdown import

## Non-goals

- No required cloud services
- No organization-wide install flow
- No write-back automation at first

## Acceptance Criteria

- Importers are optional
- Imported records can be reviewed before saving
- Sensitive imported data remains local
- Importers do not change the core local-first principle

---

# Phase 10: Polish and Trust

Goal: Make the tool trustworthy and pleasant to use.

## Scope

- Better dashboard layout
- Empty states and onboarding
- Search across decisions, work, risks, and incidents
- Markdown import/export polish
- Data backup/export
- Audit trail for decision status changes
- More tests
- Documentation
- Sample dataset

## Acceptance Criteria

- New user can understand the app in under 10 minutes
- Sample data demonstrates the full workflow
- All core data can be exported
- Tests cover critical report generation and decision linking behavior
- Product principles are visible in docs and reflected in UI

---

## Sample Dataset

Use a fictional team to make local development realistic.

Team:

```txt
Atlas Platform
```

Product area:

```txt
Internal billing and identity platform
```

Areas:

```txt
auth
billing
frontend
platform
deployments
observability
data
```

Seed decisions:

```txt
DEC-001: DecisionDeck is local-first.
DEC-002: DecisionDeck must not rank individual engineers.
DEC-003: Every metric needs interpretation notes.
DEC-004: Risky work should link to relevant decisions.
DEC-005: Weekly reports distinguish facts from interpretation.
DEC-006: Human approval is required before committing durable decisions.
DEC-007: Auth changes require rollback plans.
DEC-008: Billing events must be idempotent.
DEC-009: Audit logs are append-only.
DEC-010: Production permission changes require two reviewers.
DEC-011: Deployment rollback must be tested before release.
```

Seed work items:

```txt
Refactor login session handling
Add billing webhook retry dashboard
Migrate audit logs to partitioned table
Improve deploy rollback checklist
Replace legacy admin permissions model
```

Seed risks:

```txt
Only one engineer understands billing retries
Auth refactor has unclear rollback path
Audit table is growing too quickly
Deploy checklist is not consistently followed
```

Seed incidents:

```txt
Production deploy required manual rollback
Billing webhook retries caused duplicate notifications
Audit-log query degraded dashboard performance
```

---

## Anti-Features

These are features the project should intentionally avoid unless a future decision explicitly reverses this guidance.

Do not build:

- Individual engineer productivity scores
- Commit-count metrics
- Lines-of-code metrics
- PR-count leaderboards
- Automated performance-review summaries
- Hidden surveillance features
- Recommendations that do not cite evidence
- Automatic decision acceptance without human approval
- Cloud sync as a requirement for MVP

---

## Testing Strategy

### Unit Tests

Cover:

- Decision status transitions
- Decision review queue rules
- Work-to-decision matching
- Report generation
- Risk filtering
- Follow-up overdue detection

### Integration Tests

Cover:

- Creating a decision and linking it to work
- Generating a weekly report with linked decisions
- Moving a decision to needs_review
- Creating an incident with overdue follow-ups

### Quorum Evaluation Scenarios

Use these recurring prompts as regression tests.

#### Scenario 1: Bad metric proposal

Input:

```txt
Add a dashboard showing PR count per engineer.
```

Expected:

- Quorum retrieves DEC-002
- Proposal is rejected or revised
- Alternative suggests team-level flow metrics

#### Scenario 2: Risky auth work

Input:

```txt
Refactor login session handling with no rollback plan.
```

Expected:

- Quorum retrieves auth rollback decision
- Review flags missing rollback and test evidence
- Recommendation is revise before proceeding

#### Scenario 3: Unsupported weekly recommendation

Input:

```txt
The weekly report says the team is underperforming because reviews are slow.
```

Expected:

- Quorum flags unsupported individual/team performance inference
- Recommendation is rewritten as a system-level observation
- Report cites review backlog or blocked work instead

#### Scenario 4: Stale architecture decision

Input:

```txt
A REST-vs-GraphQL decision is 9 months old and three new work items mention GraphQL.
```

Expected:

- Decision enters review queue
- Quorum recommends review or superseding proposal
- It does not automatically change the decision status

---

## Implementation Notes

### Start Manual

Manual entry is good enough for the MVP. Do not start with GitHub, Jira, Slack, or calendar integrations.

The first question is not whether the app can ingest everything. The first question is whether the model is useful when an EM enters a small amount of curated information.

### Prefer Evidence Links

Whenever the app makes a recommendation, it should show the records that support it.

Example:

```txt
Recommendation:
Review auth rollback plan before merging.

Evidence:
- Work item: Refactor login session handling
- Risk level: high
- Linked decision: DEC-007 Auth changes require rollback plans
```

### Keep AI Output Reviewable

Quorum or any LLM-backed feature should produce reviewable output. The user should be able to accept, edit, or reject it.

### Keep Data Portable

Every major object should be exportable as Markdown or JSON.

---

## MVP Definition

DecisionDeck MVP is complete when a local user can:

1. Create and manage decisions
2. Create and manage active work items
3. Link work to decisions
4. Track risks
5. Track incidents and follow-ups
6. Generate a weekly Markdown report
7. See decisions due for review
8. Use Quorum to review at least one proposed decision or weekly report
9. Export core data locally

The MVP does not require external integrations.

---

## One-Line Build Brief

Build DecisionDeck, a local-first engineering manager dashboard that connects active work, risks, incidents, and weekly reports to a durable decision ledger, using Quorum to retrieve prior decisions, challenge new proposals, and prevent the tool from drifting into unsupported or harmful management metrics.
