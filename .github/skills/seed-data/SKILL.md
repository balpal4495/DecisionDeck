---
name: seed-data
description: "Use when: creating or updating db/seed.ts with initial DEC decisions or Atlas Platform sample data. Covers the idempotent upsert pattern, all 11 initial DEC entries, Atlas work items, risks, and incidents."
---

# Seed Data

## Rule

`db/seed.ts` is idempotent — safe to run multiple times. Use `onConflictDoNothing()` throughout.

## Run Command

```bash
npx tsx db/seed.ts
```

## Seed Structure

```typescript
// db/seed.ts
import { db } from "./index"
import { decisions, workItems, risks, incidents } from "./schema"

async function seed() {
  console.log("Seeding DecisionDeck...")

  await seedDecisions()
  await seedWorkItems()
  await seedRisks()
  await seedIncidents()

  console.log("Done.")
}

seed().catch(console.error)
```

## Initial DEC Entries (all 11 must be seeded)

```typescript
async function seedDecisions() {
  await db.insert(decisions).values([
    {
      id: "dec-001",
      title: "DecisionDeck is local-first",
      status: "accepted",
      area: "platform",
      context: "EM data can be sensitive. Local-first storage allows safe experimentation.",
      decision: "DecisionDeck stores data locally by default. External integrations are optional.",
      rationale: "Avoids premature integration complexity. Protects sensitive EM data.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-002",
      title: "DecisionDeck must not rank individual engineers",
      status: "accepted",
      area: "platform",
      context: "The product exists to improve team systems, not evaluate individuals.",
      decision: "No individual productivity rankings, leaderboards, or scorecards.",
      rationale: "Weak signals misused as performance data cause harm.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-003",
      title: "Every metric needs interpretation notes",
      status: "accepted",
      area: "platform",
      context: "Metrics without context are easy to misuse.",
      decision: "Any metric shown must include context about what it does and does not mean.",
      rationale: "Prevents misinterpretation by managers or stakeholders.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-004",
      title: "Risky work should link to relevant decisions",
      status: "accepted",
      area: "platform",
      context: "High-risk work items need decision traceability.",
      decision: "High-risk work items must link to accepted decisions that constrain them.",
      rationale: "Prevents teams from repeating past debates or violating operating rules.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-005",
      title: "Weekly reports distinguish facts from interpretation",
      status: "accepted",
      area: "platform",
      decision: "Generated reports separate observed facts from recommendations and interpretations.",
      context: "EM reports must be trustworthy and not conflate data with judgment.",
      rationale: "Trustworthy reports require clear separation of evidence and inference.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-006",
      title: "Human approval required before committing Chronicle entries",
      status: "accepted",
      area: "platform",
      decision: "Quorum proposes Chronicle entries. A human must call oracle.commit() to index them.",
      context: "The decision ledger must be trusted and curated.",
      rationale: "Auto-committed memory creates institutional drift without accountability.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-007",
      title: "Auth changes require rollback plans",
      status: "accepted",
      area: "auth",
      decision: "All auth-related changes must include a documented rollback path.",
      context: "Auth failures affect all users. Rollback paths are non-negotiable.",
      rationale: "Previous auth incidents required manual intervention due to missing rollback plans.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-008",
      title: "Billing events must be idempotent",
      status: "accepted",
      area: "billing",
      decision: "All billing event handlers must be idempotent.",
      context: "Duplicate billing events caused double charges in past incidents.",
      rationale: "Billing retries are a normal part of webhook infrastructure.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-009",
      title: "Audit logs are append-only",
      status: "accepted",
      area: "data",
      decision: "Audit log tables are append-only. No UPDATE or DELETE on audit records.",
      context: "Audit logs must be tamper-evident for compliance.",
      rationale: "Mutable audit logs cannot be trusted as evidence.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-010",
      title: "Production permission changes require two reviewers",
      status: "accepted",
      area: "platform",
      decision: "Any change to production permissions requires approval from two reviewers.",
      context: "Single-reviewer permission changes have caused access control incidents.",
      rationale: "Two-person integrity rule reduces blast radius of mistakes.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "dec-011",
      title: "Deployment rollback must be tested before release",
      status: "accepted",
      area: "deployments",
      decision: "Every deployment must include a tested rollback path before it goes live.",
      context: "Production deploys that required manual rollback revealed gaps in rollback testing.",
      rationale: "Untested rollback paths fail under pressure.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]).onConflictDoNothing()
}
```

## Atlas Sample Data

Seed work items, risks, and incidents using the Atlas Platform team data from `DecisionDeck.md`. Follow the same `onConflictDoNothing()` pattern.
