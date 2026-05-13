import { db } from "./index"
import { decisions, workItems, risks, incidents } from "./schema"

async function seed() {
  console.log("Seeding DecisionDeck...")

  await seedDecisions()
  await seedWorkItems()
  await seedRisks()
  await seedIncidents()

  console.log("Done.")
  process.exit(0)
}

async function seedDecisions() {
  const now = new Date().toISOString()

  await db
    .insert(decisions)
    .values([
      {
        id: "dec-001",
        title: "DecisionDeck is local-first",
        status: "accepted",
        area: "platform",
        context: "EM data can be sensitive. Local-first storage allows safe experimentation.",
        decision: "DecisionDeck stores data locally by default. External integrations are optional.",
        rationale: "Avoids premature integration complexity. Protects sensitive EM data.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-002",
        title: "DecisionDeck must not rank individual engineers",
        status: "accepted",
        area: "platform",
        context: "The product exists to improve team systems, not evaluate individuals.",
        decision: "No individual productivity rankings, leaderboards, or scorecards.",
        rationale: "Weak signals misused as performance data cause harm.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-003",
        title: "Every metric needs interpretation notes",
        status: "accepted",
        area: "platform",
        context: "Metrics without context are easy to misuse.",
        decision: "Any metric shown must include context about what it does and does not mean.",
        rationale: "Prevents misinterpretation by managers or stakeholders.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-004",
        title: "Risky work should link to relevant decisions",
        status: "accepted",
        area: "platform",
        context: "High-risk work items need decision traceability.",
        decision: "High-risk work items must link to accepted decisions that constrain them.",
        rationale: "Prevents teams from repeating past debates or violating operating rules.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-005",
        title: "Weekly reports distinguish facts from interpretation",
        status: "accepted",
        area: "platform",
        context: "EM reports must be trustworthy and not conflate data with judgment.",
        decision: "Generated reports separate observed facts from recommendations and interpretations.",
        rationale: "Trustworthy reports require clear separation of evidence and inference.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-006",
        title: "Human approval required before committing Chronicle entries",
        status: "accepted",
        area: "platform",
        context: "The decision ledger must be trusted and curated.",
        decision: "Quorum proposes Chronicle entries. A human must call oracle.commit() to index them.",
        rationale: "Auto-committed memory creates institutional drift without accountability.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-007",
        title: "Auth changes require rollback plans",
        status: "accepted",
        area: "auth",
        context: "Auth failures affect all users. Rollback paths are non-negotiable.",
        decision: "All auth-related changes must include a documented rollback path.",
        rationale: "Previous auth incidents required manual intervention due to missing rollback plans.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-008",
        title: "Billing events must be idempotent",
        status: "accepted",
        area: "billing",
        context: "Duplicate billing events caused double charges in past incidents.",
        decision: "All billing event handlers must be idempotent.",
        rationale: "Billing retries are a normal part of webhook infrastructure.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-009",
        title: "Audit logs are append-only",
        status: "accepted",
        area: "data",
        context: "Audit logs must be tamper-evident for compliance.",
        decision: "Audit log tables are append-only. No UPDATE or DELETE on audit records.",
        rationale: "Mutable audit logs cannot be trusted as evidence.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-010",
        title: "Production permission changes require two reviewers",
        status: "accepted",
        area: "platform",
        context: "Single-reviewer permission changes have caused access control incidents.",
        decision: "Any change to production permissions requires approval from two reviewers.",
        rationale: "Two-person integrity rule reduces blast radius of mistakes.",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "dec-011",
        title: "Deployment rollback must be tested before release",
        status: "accepted",
        area: "deployments",
        context: "Production deploys that required manual rollback revealed gaps in rollback testing.",
        decision: "Every deployment must include a tested rollback path before it goes live.",
        rationale: "Untested rollback paths fail under pressure.",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing()

  console.log("  ✓ Seeded 11 decisions (DEC-001–DEC-011)")
}

async function seedWorkItems() {
  const now = new Date().toISOString()

  await db
    .insert(workItems)
    .values([
      {
        id: "wi-001",
        title: "Refactor login session handling",
        status: "in_progress",
        area: "auth",
        riskLevel: "high",
        notes: "Atlas Platform — authentication module refactor",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "wi-002",
        title: "Add billing webhook retry dashboard",
        status: "not_started",
        area: "billing",
        riskLevel: "medium",
        notes: "Atlas Platform — billing reliability",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "wi-003",
        title: "Migrate audit logs to partitioned table",
        status: "blocked",
        area: "data",
        riskLevel: "high",
        blockedReason: "Waiting on DBA sign-off for partition strategy",
        notes: "Atlas Platform — audit log performance",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "wi-004",
        title: "Improve deploy rollback checklist",
        status: "in_progress",
        area: "deployments",
        riskLevel: "medium",
        notes: "Atlas Platform — deployment reliability",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "wi-005",
        title: "Replace legacy admin permissions model",
        status: "not_started",
        area: "platform",
        riskLevel: "high",
        notes: "Atlas Platform — permissions overhaul",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing()

  console.log("  ✓ Seeded 5 work items (Atlas Platform)")
}

async function seedRisks() {
  const now = new Date().toISOString()

  await db
    .insert(risks)
    .values([
      {
        id: "risk-001",
        title: "Only one engineer understands billing webhook retries",
        area: "billing",
        severity: "high",
        likelihood: "medium",
        status: "open",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "risk-002",
        title: "Auth refactor has unclear rollback path",
        area: "auth",
        severity: "high",
        likelihood: "high",
        status: "open",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "risk-003",
        title: "Audit table is growing too quickly",
        area: "data",
        severity: "medium",
        likelihood: "high",
        status: "open",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "risk-004",
        title: "Deploy checklist is not consistently followed",
        area: "deployments",
        severity: "medium",
        likelihood: "medium",
        status: "open",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing()

  console.log("  ✓ Seeded 4 risks (Atlas Platform)")
}

async function seedIncidents() {
  const now = new Date().toISOString()

  await db
    .insert(incidents)
    .values([
      {
        id: "inc-001",
        title: "Production deploy required manual rollback",
        severity: "sev2",
        area: "deployments",
        date: "2026-04-28",
        summary: "A production deployment to the Atlas Platform failed due to a missing migration step, requiring a manual rollback that took 45 minutes.",
        impact: "Atlas Platform was degraded for 45 minutes affecting internal users.",
        contributingFactors: "Missing pre-deploy checklist step for migration validation.",
        followUps: JSON.stringify([
          { id: "fu-001", title: "Add migration validation to deploy checklist", status: "open", owner: null },
          { id: "fu-002", title: "Run a rollback drill for the next release", status: "open", owner: null },
        ]),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "inc-002",
        title: "Billing webhook retries caused duplicate notifications",
        severity: "sev3",
        area: "billing",
        date: "2026-05-02",
        summary: "Billing webhook retry logic sent duplicate payment confirmation emails to ~30 customers.",
        impact: "Customer confusion and support tickets. No financial impact.",
        contributingFactors: "Webhook handler was not idempotent on retry.",
        followUps: JSON.stringify([
          { id: "fu-003", title: "Add idempotency key to billing event handler", status: "open", owner: null },
        ]),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "inc-003",
        title: "Audit-log query degraded dashboard performance",
        severity: "sev3",
        area: "data",
        date: "2026-05-07",
        summary: "Full table scan on the audit_logs table caused dashboard load times to exceed 10 seconds during peak hours.",
        impact: "Dashboard was effectively unusable for ~2 hours in peak hours.",
        contributingFactors: "No index on audit_logs.created_at. Table has grown to 40M rows.",
        followUps: JSON.stringify([
          { id: "fu-004", title: "Add index on audit_logs.created_at", status: "in_progress", owner: null },
          { id: "fu-005", title: "Evaluate audit log table partitioning", status: "open", owner: null },
        ]),
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing()

  console.log("  ✓ Seeded 3 incidents (Atlas Platform)")
}

seed().catch(console.error)
