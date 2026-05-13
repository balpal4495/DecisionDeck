---
name: phase-scoping
description: "Use when: scoping work to a build phase, checking non-goals before implementing a feature, or deciding whether something belongs in the current phase vs a future one. Covers all phase boundaries and non-goals for Phases 0–10."
---

# Phase Scoping

## Rule

Non-goals are hard constraints. If a feature is listed as a non-goal for the current phase, block it and surface the phase where it belongs.

## Phase Boundaries

### Phase 0 — Project Foundation
**In scope:** Next.js + TypeScript init, SQLite + Drizzle, navigation shell, test setup, seed script, DEC entries 1–11, Quorum init.
**Non-goals:** No external integrations, no auth, no multi-user, no advanced analytics.
**Gate:** App runs locally with seeded data and passing tests.

### Phase 1 — Decision Ledger
**In scope:** `decisions` table, list/detail/create/edit pages, status management (proposed/accepted/rejected/superseded/needs_review), area + status filter, review date, Markdown export.
**Non-goals:** No semantic search, no complex approval workflow, no integrations.
**Gate:** User can create, edit, filter, and export decisions. Seed decisions visible.

### Phase 2 — Work Radar
**In scope:** `workItems` table, work list/create/edit, blocked + high-risk flags, link decisions to work, dashboard cards for blocked/high-risk/in-review/missing-decisions.
**Non-goals:** No GitHub import, no auto owner inference, no performance analytics.
**Gate:** User can create work items, mark as blocked/high-risk, link to decisions.

### Phase 3 — Decision Linking
**In scope:** Tags/topics on decisions, area match, keyword match, "Find relevant decisions" action on work items, accept/dismiss UI, store accepted links.
**Non-goals:** No embeddings, no full-text search engine, no autonomous linking.
**Gate:** User can click "Find relevant decisions" and get explainable suggestions.

### Phase 4 — Risk Register
**In scope:** `risks` table, risk list/create/edit, severity + likelihood + status + mitigation + review date, link risks to work + decisions, dashboard cards for open high risks.
**Non-goals:** No quantitative scoring, no automated severity calculation, no executive export.
**Gate:** User can create risks, link them, see high risks on dashboard.

### Phase 5 — Incident Follow-up Tracker
**In scope:** `incidents` table, `incidentFollowUps` (JSON or table), incident list/create/edit, follow-up tracking, link incidents to decisions + work + risks, overdue follow-ups on dashboard.
**Non-goals:** No incident timeline builder, no paging/alerting integrations, no complex postmortem templates.
**Gate:** User can record incidents, track follow-ups, see overdue items on dashboard.

### Phase 6 — Weekly Report Generator
**In scope:** Report generation page, week selector, all sections (blocked/high-risk/risks/incidents/decisions/follow-ups), fact-vs-interpretation separation, Markdown export, save reports locally.
**Non-goals:** No auto Slack/email/Notion post, no executive-specific formatting, no generative recommendations without citation.
**Gate:** User generates and exports a weekly Markdown report with decision citations.

### Phase 7 — Decision Review Queue
**In scope:** Review queue page, rule-based triggers (review date, no owner, open risks, open incidents, superseded reference, rejected reappearance), mark reviewed, move to needs_review, create superseding decision.
**Non-goals:** No automatic status changes, no hidden background jobs, no complex contradiction detection.
**Gate:** Stale decisions surface in queue; user can act on them.

### Phase 8 — Quorum-Backed Review Actions
**In scope:** Quorum review from decision/work item/report; show evidence + recommendation; save output; propose Chronicle entry; Oracle semantic search for decision matching.
**Non-goals:** No autonomous approval, no auto Chronicle commits, no hidden model actions.
**Gate:** User can run Quorum review from any major record.

### Phase 9 — Optional Importers
**In scope:** ADR Markdown import, GitHub PR import, Linear/Jira CSV import, Incident Markdown import. All via preview → confirm pipeline.
**Non-goals:** No required cloud services, no org-wide install, no write-back automation.
**Gate:** User can import records, review them, and save confirmed items.

### Phase 10 — Polish and Trust
**In scope:** Dashboard layout, empty states, onboarding, cross-entity search, data backup/export, audit trail, sample dataset, documentation.
**Gate:** New user can understand the app in under 10 minutes with sample data.

## Blocker Response

If requested work violates a non-goal:

```
⛔ Phase boundary: "{feature}" is a non-goal for Phase {n}.
It is in scope for Phase {m}: {phase name}.
Current phase {n} gate is not yet met / is met — consider progressing to Phase {m} first.
```
