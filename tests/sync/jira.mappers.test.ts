import { describe, it, expect } from "vitest"
import {
  inferAreaFromJira,
  inferRiskLevelFromJira,
  mapJiraStatus,
  extractBlockedReason,
  type JiraIssueLink,
} from "../../lib/jira/mappers"

// ── inferAreaFromJira ─────────────────────────────────────────────────────────

describe("inferAreaFromJira", () => {
  it("infers area from summary keyword", () => {
    expect(inferAreaFromJira("Fix OAuth login redirect", [])).toBe("auth")
    expect(inferAreaFromJira("Update Stripe billing webhook", [])).toBe("billing")
    expect(inferAreaFromJira("Run schema migration for new column", [])).toBe("data")
    expect(inferAreaFromJira("Add deploy step to CI pipeline", [])).toBe("deployments")
    expect(inferAreaFromJira("Add Sentry alert for p99 latency", [])).toBe("observability")
    expect(inferAreaFromJira("Refactor UI component with new CSS", [])).toBe("frontend")
  })

  it("infers area from labels when summary has no match", () => {
    expect(inferAreaFromJira("Update stuff", ["oauth"])).toBe("auth")
    expect(inferAreaFromJira("Update stuff", ["migration"])).toBe("data")
  })

  it("falls back to platform when no keyword matches", () => {
    expect(inferAreaFromJira("Miscellaneous update", [])).toBe("platform")
    expect(inferAreaFromJira("Bump version to 2.0.0", [])).toBe("platform")
  })
})

// ── inferRiskLevelFromJira ────────────────────────────────────────────────────

describe("inferRiskLevelFromJira", () => {
  it("returns high for Highest priority", () => {
    expect(inferRiskLevelFromJira("Highest", [])).toBe("high")
  })

  it("returns high for High priority", () => {
    expect(inferRiskLevelFromJira("High", [])).toBe("high")
  })

  it("returns medium for Medium priority", () => {
    expect(inferRiskLevelFromJira("Medium", [])).toBe("medium")
  })

  it("returns low for Low priority", () => {
    expect(inferRiskLevelFromJira("Low", [])).toBe("low")
  })

  it("returns low for Lowest priority", () => {
    expect(inferRiskLevelFromJira("Lowest", [])).toBe("low")
  })

  it("returns low for null/undefined priority", () => {
    expect(inferRiskLevelFromJira(null, [])).toBe("low")
    expect(inferRiskLevelFromJira(undefined, [])).toBe("low")
  })

  it("label 'high-risk' overrides priority", () => {
    expect(inferRiskLevelFromJira("Low", ["high-risk"])).toBe("high")
  })

  it("label 'breaking-change' forces high", () => {
    expect(inferRiskLevelFromJira("Medium", ["breaking-change"])).toBe("high")
  })

  it("label 'security' forces high", () => {
    expect(inferRiskLevelFromJira("Low", ["security"])).toBe("high")
  })

  it("label 'critical' forces high", () => {
    expect(inferRiskLevelFromJira("Low", ["critical"])).toBe("high")
  })

  it("label check is case-insensitive", () => {
    expect(inferRiskLevelFromJira("Low", ["High-Risk"])).toBe("high")
    expect(inferRiskLevelFromJira("Low", ["SECURITY"])).toBe("high")
  })
})

// ── mapJiraStatus ─────────────────────────────────────────────────────────────

describe("mapJiraStatus", () => {
  it("maps 'done' category to done", () => {
    expect(mapJiraStatus("done", "Done")).toBe("done")
    expect(mapJiraStatus("done", "Closed")).toBe("done")
  })

  it("maps review-named statuses to in_review", () => {
    expect(mapJiraStatus("indeterminate", "In Review")).toBe("in_review")
    expect(mapJiraStatus("indeterminate", "Code Review")).toBe("in_review")
    expect(mapJiraStatus("indeterminate", "PR Open")).toBe("in_review")
    expect(mapJiraStatus("indeterminate", "Review")).toBe("in_review")
  })

  it("maps 'indeterminate' category with non-review name to in_progress", () => {
    expect(mapJiraStatus("indeterminate", "In Progress")).toBe("in_progress")
    expect(mapJiraStatus("indeterminate", "Development")).toBe("in_progress")
  })

  it("maps 'new' category to not_started", () => {
    expect(mapJiraStatus("new", "To Do")).toBe("not_started")
    expect(mapJiraStatus("new", "Backlog")).toBe("not_started")
  })

  it("category matching is case-insensitive", () => {
    expect(mapJiraStatus("Done", "Closed")).toBe("done")
    expect(mapJiraStatus("NEW", "To Do")).toBe("not_started")
  })
})

// ── extractBlockedReason ──────────────────────────────────────────────────────

describe("extractBlockedReason", () => {
  const activeBlocker: JiraIssueLink = {
    type: { inward: "is blocked by" },
    inwardIssue: {
      key: "PROJ-99",
      fields: {
        summary: "Deploy infra changes",
        status: { statusCategory: { key: "indeterminate" } },
      },
    },
  }

  const doneBlocker: JiraIssueLink = {
    type: { inward: "is blocked by" },
    inwardIssue: {
      key: "PROJ-10",
      fields: {
        summary: "Old blocker",
        status: { statusCategory: { key: "done" } },
      },
    },
  }

  const unrelatedLink: JiraIssueLink = {
    type: { inward: "relates to" },
    inwardIssue: { key: "PROJ-50" },
  }

  it("returns null when there are no issue links", () => {
    expect(extractBlockedReason([])).toBeNull()
  })

  it("returns null when all blockers are Done", () => {
    expect(extractBlockedReason([doneBlocker])).toBeNull()
  })

  it("returns null for unrelated link types", () => {
    expect(extractBlockedReason([unrelatedLink])).toBeNull()
  })

  it("returns a reason string for an active blocker", () => {
    const reason = extractBlockedReason([activeBlocker])
    expect(reason).toBe("Blocked by PROJ-99: Deploy infra changes")
  })

  it("includes the issue key even when summary is missing", () => {
    const noSummary: JiraIssueLink = {
      type: { inward: "is blocked by" },
      inwardIssue: {
        key: "PROJ-77",
        fields: { status: { statusCategory: { key: "new" } } },
      },
    }
    expect(extractBlockedReason([noSummary])).toBe("Blocked by PROJ-77")
  })

  it("concatenates multiple active blockers", () => {
    const second: JiraIssueLink = {
      type: { inward: "is blocked by" },
      inwardIssue: {
        key: "PROJ-100",
        fields: {
          summary: "Another blocker",
          status: { statusCategory: { key: "new" } },
        },
      },
    }
    const reason = extractBlockedReason([activeBlocker, second])
    expect(reason).toBe(
      "Blocked by PROJ-99: Deploy infra changes; PROJ-100: Another blocker",
    )
  })

  it("ignores done blockers and includes only active ones", () => {
    const reason = extractBlockedReason([doneBlocker, activeBlocker])
    expect(reason).toBe("Blocked by PROJ-99: Deploy infra changes")
  })
})
