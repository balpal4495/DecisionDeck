import { describe, it, expect } from "vitest"
import {
  classifyWorkItem,
  extractSourceDates,
  triageAll,
  summariseTriage,
  TRIAGE_THRESHOLDS,
  type TriageResult,
} from "@/lib/triage"
import type { WorkItem } from "@/db/schema"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date("2026-05-13T12:00:00Z")

function days(n: number): Date {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  return d
}

function iso(d: Date): string {
  return d.toISOString()
}

function base(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "wi-001",
    title: "Test item",
    status: "not_started",
    area: "platform",
    owner: null,
    riskLevel: "low",
    blockedReason: null,
    targetDate: null,
    notes: null,
    source: "jira",
    externalId: "DBD-001",
    externalUrl: "https://jira.example.com/browse/DBD-001",
    rawData: null,
    lastSyncedAt: null,
    linkedDecisionIds: "[]",
    linkedRiskIds: "[]",
    linkedIncidentIds: "[]",
    createdAt: iso(days(10)),
    updatedAt: iso(days(10)),
    ...overrides,
  }
}

function jiraRawData(opts: {
  created: Date
  updated: Date
  assignee?: boolean
}): string {
  return JSON.stringify({
    fields: {
      created: iso(opts.created),
      updated: iso(opts.updated),
      assignee: opts.assignee ? { displayName: "Alice" } : null,
    },
  })
}

function githubRawData(opts: {
  created: Date
  updated: Date
  assignee?: boolean
}): string {
  return JSON.stringify({
    created_at: iso(opts.created),
    updated_at: iso(opts.updated),
    assignee: opts.assignee ? { login: "alice" } : null,
  })
}

// ── extractSourceDates ────────────────────────────────────────────────────────

describe("extractSourceDates", () => {
  it("returns nulls for null rawData", () => {
    expect(extractSourceDates(null, "jira")).toEqual({
      created: null,
      updated: null,
      hasAssignee: false,
    })
  })

  it("returns nulls for malformed JSON", () => {
    expect(extractSourceDates("not-json", "jira")).toEqual({
      created: null,
      updated: null,
      hasAssignee: false,
    })
  })

  it("extracts Jira fields correctly", () => {
    const raw = jiraRawData({
      created: days(100),
      updated: days(20),
      assignee: true,
    })
    const result = extractSourceDates(raw, "jira")
    expect(result.hasAssignee).toBe(true)
    expect(result.created).toBeTruthy()
    expect(result.updated).toBeTruthy()
  })

  it("extracts GitHub fields correctly", () => {
    const raw = githubRawData({
      created: days(50),
      updated: days(5),
      assignee: false,
    })
    const result = extractSourceDates(raw, "github")
    expect(result.hasAssignee).toBe(false)
    expect(result.created).toBeTruthy()
    expect(result.updated).toBeTruthy()
  })

  it("returns false hasAssignee when assignee is null in Jira", () => {
    const raw = jiraRawData({ created: days(10), updated: days(5), assignee: false })
    expect(extractSourceDates(raw, "jira").hasAssignee).toBe(false)
  })

  it("returns nulls for unknown source", () => {
    const raw = JSON.stringify({ created: iso(days(10)) })
    expect(extractSourceDates(raw, "manual")).toEqual({
      created: null,
      updated: null,
      hasAssignee: false,
    })
  })
})

// ── classifyWorkItem ──────────────────────────────────────────────────────────

describe("classifyWorkItem — done", () => {
  it("classifies done items regardless of age", () => {
    const item = base({
      status: "done",
      rawData: jiraRawData({ created: days(200), updated: days(200) }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("done")
    expect(result.signal).toMatch(/completed/i)
  })
})

describe("classifyWorkItem — blocked", () => {
  it("classifies recently-blocked items", () => {
    const item = base({
      status: "blocked",
      blockedReason: "Waiting on infra team",
      rawData: jiraRawData({ created: days(30), updated: days(5) }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("blocked")
    expect(result.signal).toContain("Waiting on infra team")
  })

  it("signals frozen when blocked with no movement past threshold", () => {
    const item = base({
      status: "blocked",
      blockedReason: "Dependency on external team",
      rawData: jiraRawData({
        created: days(90),
        updated: days(TRIAGE_THRESHOLDS.BLOCKED_FROZEN_DAYS + 5),
      }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("blocked")
    expect(result.signal).toMatch(/frozen/i)
  })

  it("notes missing reason when blockedReason is null", () => {
    const item = base({
      status: "blocked",
      blockedReason: null,
      rawData: jiraRawData({ created: days(10), updated: days(3) }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("blocked")
    expect(result.signal).toMatch(/no reason recorded/i)
  })
})

describe("classifyWorkItem — active", () => {
  it("classifies in_progress updated recently as active", () => {
    const item = base({
      status: "in_progress",
      rawData: jiraRawData({ created: days(30), updated: days(3) }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("active")
    expect(result.signal).toMatch(/in progress/i)
    expect(result.daysSinceUpdate).toBe(3)
  })

  it("classifies in_review updated recently as active", () => {
    const item = base({
      status: "in_review",
      rawData: jiraRawData({ created: days(20), updated: days(7) }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("active")
    expect(result.signal).toMatch(/in review/i)
  })

  it("classifies in_progress with no update past STALE_DAYS as stale", () => {
    const item = base({
      status: "in_progress",
      rawData: jiraRawData({
        created: days(120),
        updated: days(TRIAGE_THRESHOLDS.STALE_DAYS + 10),
      }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("stale")
    expect(result.signal).toMatch(/may be abandoned/i)
  })
})

describe("classifyWorkItem — not_started", () => {
  it("classifies recently created not_started as queued", () => {
    const item = base({
      status: "not_started",
      rawData: jiraRawData({ created: days(10), updated: days(10) }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("queued")
    expect(result.signal).toMatch(/not started/i)
  })

  it("classifies old not_started with no updates as abandoned", () => {
    const item = base({
      status: "not_started",
      rawData: jiraRawData({
        created: days(TRIAGE_THRESHOLDS.ABANDONED_DAYS + 10),
        updated: days(TRIAGE_THRESHOLDS.ABANDONED_DAYS + 10),
      }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("abandoned")
    expect(result.signal).toMatch(/no updates/i)
  })

  it("classifies not_started with intermediate age as stale", () => {
    const item = base({
      status: "not_started",
      rawData: jiraRawData({
        created: days(75),
        updated: days(75),
      }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("stale")
  })

  it("classifies not_started with old create but recent update as queued", () => {
    const item = base({
      status: "not_started",
      rawData: jiraRawData({
        created: days(200),
        updated: days(5),
      }),
    })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("queued")
  })
})

describe("classifyWorkItem — null rawData fallback", () => {
  it("classifies in_progress with no rawData as stale (unknown dates)", () => {
    const item = base({ status: "in_progress", rawData: null })
    const result = classifyWorkItem(item, NOW)
    expect(result.category).toBe("stale")
    expect(result.daysSinceUpdate).toBe(-1)
    expect(result.daysSinceCreated).toBe(-1)
  })

  it("passes through externalUrl and externalId", () => {
    const item = base({ externalUrl: "https://jira.example.com/DBD-1", externalId: "DBD-1" })
    const result = classifyWorkItem(item, NOW)
    expect(result.externalUrl).toBe("https://jira.example.com/DBD-1")
    expect(result.externalId).toBe("DBD-1")
  })
})

// ── triageAll + summariseTriage ───────────────────────────────────────────────

describe("triageAll", () => {
  it("returns a result for every item", () => {
    const items = [
      base({ id: "1", status: "done" }),
      base({ id: "2", status: "blocked" }),
      base({
        id: "3",
        status: "not_started",
        rawData: jiraRawData({ created: days(10), updated: days(10) }),
      }),
    ]
    const results = triageAll(items, NOW)
    expect(results).toHaveLength(3)
    expect(results.map(r => r.category)).toEqual(["done", "blocked", "queued"])
  })
})

describe("summariseTriage", () => {
  it("produces correct counts and rollups", () => {
    const results: TriageResult[] = [
      { ...classifyWorkItem(base({ id: "1", status: "done" }), NOW) },
      { ...classifyWorkItem(base({ id: "2", status: "blocked" }), NOW) },
      {
        ...classifyWorkItem(
          base({
            id: "3",
            status: "not_started",
            rawData: jiraRawData({ created: days(10), updated: days(10) }),
          }),
          NOW,
        ),
      },
      {
        ...classifyWorkItem(
          base({
            id: "4",
            status: "not_started",
            rawData: jiraRawData({
              created: days(TRIAGE_THRESHOLDS.ABANDONED_DAYS + 20),
              updated: days(TRIAGE_THRESHOLDS.ABANDONED_DAYS + 20),
            }),
          }),
          NOW,
        ),
      },
    ]

    const summary = summariseTriage(results)
    expect(summary.total).toBe(4)
    expect(summary.byCategory.done).toBe(1)
    expect(summary.byCategory.blocked).toBe(1)
    expect(summary.byCategory.queued).toBe(1)
    expect(summary.byCategory.abandoned).toBe(1)
    expect(summary.signal).toBe(1) // blocked only
    expect(summary.noise).toBe(2)  // done + abandoned
    expect(summary.backlog).toBe(1)
  })

  it("groups by area correctly", () => {
    const items = [
      base({ id: "1", area: "platform", status: "done" }),
      base({ id: "2", area: "platform", status: "blocked" }),
      base({ id: "3", area: "security", status: "done" }),
    ]
    const summary = summariseTriage(triageAll(items, NOW))
    expect(summary.byArea["platform"].done).toBe(1)
    expect(summary.byArea["platform"].blocked).toBe(1)
    expect(summary.byArea["security"].done).toBe(1)
  })
})
